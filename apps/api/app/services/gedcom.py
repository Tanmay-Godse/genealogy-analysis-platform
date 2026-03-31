from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Iterable


@dataclass(frozen=True)
class ParsedGedcomPerson:
    id: str
    display_name: str
    branch: str
    birth_label: str | None
    death_label: str | None
    is_living: bool
    summary: str
    coordinate: tuple[float, float, float]
    aliases: tuple[str, ...]
    evidence_source_id: str
    evidence_title: str
    evidence_note: str


@dataclass(frozen=True)
class ParsedGedcomRelationship:
    id: str
    source_id: str
    target_id: str
    kind: str
    label: str
    evidence_source_id: str
    evidence_title: str
    evidence_note: str


@dataclass(frozen=True)
class ParsedGedcomImport:
    people: list[ParsedGedcomPerson]
    relationships: list[ParsedGedcomRelationship]
    family_count: int
    focus_person_id: str | None
    people_count: int
    living_people_count: int


@dataclass
class _Individual:
    xref: str
    name: str | None = None
    sex: str | None = None
    birth_date: str | None = None
    death_date: str | None = None
    famc: list[str] = field(default_factory=list)
    fams: list[str] = field(default_factory=list)


@dataclass
class _Family:
    xref: str
    husband_id: str | None = None
    wife_id: str | None = None
    children_ids: list[str] = field(default_factory=list)


def parse_gedcom(content: str, filename: str, import_id: str) -> ParsedGedcomImport:
    individuals: dict[str, _Individual] = {}
    families: dict[str, _Family] = {}

    current_type: str | None = None
    current_id: str | None = None
    current_event: str | None = None

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        level, xref, tag, value = _parse_line(line)

        if level == 0:
            current_event = None
            current_id = None
            current_type = None

            if tag == "INDI" and xref:
                current_type = "INDI"
                current_id = xref
                individuals.setdefault(xref, _Individual(xref=xref))
            elif tag == "FAM" and xref:
                current_type = "FAM"
                current_id = xref
                families.setdefault(xref, _Family(xref=xref))
            continue

        if current_type == "INDI" and current_id:
            individual = individuals[current_id]
            if level == 1:
                current_event = tag if tag in {"BIRT", "DEAT"} else None
                if tag == "NAME":
                    individual.name = _clean_name(value)
                elif tag == "SEX":
                    individual.sex = value or None
                elif tag == "FAMC" and value:
                    individual.famc.append(value)
                elif tag == "FAMS" and value:
                    individual.fams.append(value)
            elif level == 2 and tag == "DATE" and current_event:
                if current_event == "BIRT":
                    individual.birth_date = value or None
                elif current_event == "DEAT":
                    individual.death_date = value or None
            continue

        if current_type == "FAM" and current_id:
            family = families[current_id]
            if level == 1:
                if tag == "HUSB" and value:
                    family.husband_id = value
                elif tag == "WIFE" and value:
                    family.wife_id = value
                elif tag == "CHIL" and value:
                    family.children_ids.append(value)

    return _materialize_import(individuals.values(), families.values(), filename, import_id)


def _parse_line(line: str) -> tuple[int, str | None, str, str]:
    parts = line.split(" ", 2)
    level = int(parts[0])

    if len(parts) == 1:
        return level, None, "", ""

    if len(parts) >= 3 and parts[1].startswith("@"):
        xref = parts[1].strip("@")
        tag_parts = parts[2].split(" ", 1)
        tag = tag_parts[0]
        value = tag_parts[1] if len(tag_parts) > 1 else ""
        return level, xref, tag, value

    tag = parts[1]
    value = parts[2] if len(parts) > 2 else ""
    if value.startswith("@") and value.endswith("@"):
        value = value.strip("@")
    return level, None, tag, value


def _clean_name(name: str | None) -> str:
    if not name:
        return "Unknown Person"
    return " ".join(part for part in name.replace("/", "").split() if part)


def _birth_year(label: str | None) -> int | None:
    if not label:
        return None
    for token in reversed(label.replace(",", " ").split()):
        if token.isdigit() and len(token) == 4:
            return int(token)
    return None


def _infer_is_living(birth_label: str | None, death_label: str | None) -> bool:
    if death_label:
        return False
    birth_year = _birth_year(birth_label)
    current_year = datetime.now(UTC).year
    return birth_year is None or birth_year > current_year - 120


def _materialize_import(
    individuals: Iterable[_Individual],
    families: Iterable[_Family],
    filename: str,
    import_id: str,
) -> ParsedGedcomImport:
    individuals_by_id = {individual.xref: individual for individual in individuals}
    families_list = list(families)

    parent_links: dict[str, set[str]] = {individual.xref: set() for individual in individuals_by_id.values()}
    partner_pairs: set[tuple[str, str]] = set()
    relationships: list[ParsedGedcomRelationship] = []

    for family in families_list:
        spouses = [person_id for person_id in [family.husband_id, family.wife_id] if person_id]
        if len(spouses) == 2:
            source_id, target_id = sorted(spouses)
            if (source_id, target_id) not in partner_pairs:
                partner_pairs.add((source_id, target_id))
                relationships.append(
                    ParsedGedcomRelationship(
                        id=f"rel-partner-{source_id.lower()}-{target_id.lower()}",
                        source_id=f"g-{source_id.lower()}",
                        target_id=f"g-{target_id.lower()}",
                        kind="partner_of",
                        label="partner of",
                        evidence_source_id=f"gedcom:{import_id}",
                        evidence_title=f"GEDCOM import {filename}",
                        evidence_note=f"Family record {family.xref} links the household partners.",
                    )
                )

        for child_id in family.children_ids:
            for parent_id in spouses:
                parent_links.setdefault(child_id, set()).add(parent_id)
                relationships.append(
                    ParsedGedcomRelationship(
                        id=f"rel-parent-{parent_id.lower()}-{child_id.lower()}",
                        source_id=f"g-{parent_id.lower()}",
                        target_id=f"g-{child_id.lower()}",
                        kind="parent_of",
                        label="parent of",
                        evidence_source_id=f"gedcom:{import_id}",
                        evidence_title=f"GEDCOM import {filename}",
                        evidence_note=f"Family record {family.xref} lists this parent-child relationship.",
                    )
                )

    generation_cache: dict[str, int] = {}
    visiting: set[str] = set()

    def generation_for(person_id: str) -> int:
        if person_id in generation_cache:
            return generation_cache[person_id]
        if person_id in visiting:
            return 0
        visiting.add(person_id)
        parents = parent_links.get(person_id, set())
        generation = 0 if not parents else max(generation_for(parent_id) + 1 for parent_id in parents)
        visiting.discard(person_id)
        generation_cache[person_id] = generation
        return generation

    generation_buckets: dict[int, list[str]] = {}
    for person_id in individuals_by_id:
        generation = generation_for(person_id)
        generation_buckets.setdefault(generation, []).append(person_id)

    coordinates: dict[str, tuple[float, float, float]] = {}
    for generation, bucket in generation_buckets.items():
        ordered_bucket = sorted(bucket, key=lambda person_id: _clean_name(individuals_by_id[person_id].name))
        half = (len(ordered_bucket) - 1) / 2
        for index, person_id in enumerate(ordered_bucket):
            x = (index - half) * 2.8
            y = generation * -2.7
            z = 1.1 if index % 2 else -1.1
            coordinates[person_id] = (x, y, z)

    people: list[ParsedGedcomPerson] = []
    for individual in sorted(individuals_by_id.values(), key=lambda item: _clean_name(item.name)):
        display_name = _clean_name(individual.name)
        birth_label = f"Born {individual.birth_date}" if individual.birth_date else None
        death_label = f"Died {individual.death_date}" if individual.death_date else None
        is_living = _infer_is_living(birth_label, death_label)
        people.append(
            ParsedGedcomPerson(
                id=f"g-{individual.xref.lower()}",
                display_name=display_name,
                branch="Imported GEDCOM",
                birth_label=birth_label,
                death_label=death_label,
                is_living=is_living,
                summary=_build_summary(display_name, birth_label, death_label, individual.sex),
                coordinate=coordinates.get(individual.xref, (0.0, 0.0, 0.0)),
                aliases=(display_name,),
                evidence_source_id=f"gedcom:{import_id}",
                evidence_title=f"GEDCOM import {filename}",
                evidence_note=f"Individual record {individual.xref} imported from {filename}.",
            )
        )

    focus_person_id = people[0].id if people else None
    return ParsedGedcomImport(
        people=people,
        relationships=relationships,
        family_count=len(families_list),
        focus_person_id=focus_person_id,
        people_count=len(people),
        living_people_count=sum(1 for person in people if person.is_living),
    )


def _build_summary(
    display_name: str,
    birth_label: str | None,
    death_label: str | None,
    sex: str | None,
) -> str:
    details = [detail for detail in [birth_label, death_label, sex] if detail]
    if not details:
        return f"{display_name} imported from GEDCOM."
    return f"{display_name} imported from GEDCOM. " + " · ".join(details)
