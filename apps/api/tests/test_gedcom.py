from app.services.gedcom import parse_gedcom

SAMPLE_GEDCOM = """0 HEAD
1 SOUR FAMILY_TREE_PLATFORM
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Grace /Hart/
1 SEX F
1 BIRT
2 DATE 1932
1 DEAT
2 DATE 2011
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marcus /Hart/
1 SEX M
1 BIRT
2 DATE 1955
1 FAMC @F1@
1 FAMS @F2@
0 @I3@ INDI
1 NAME Eleanor /Hart/
1 SEX F
1 BIRT
2 DATE 1957
1 FAMS @F2@
0 @I4@ INDI
1 NAME David /Hart/
1 SEX M
1 BIRT
2 DATE 1986
1 FAMC @F2@
0 @F1@ FAM
1 WIFE @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I4@
0 TRLR
"""


def test_parse_gedcom_materializes_people_relationships_and_focus():
    parsed = parse_gedcom(SAMPLE_GEDCOM, "sample.ged", "import123")

    assert parsed.people_count == 4
    assert parsed.family_count == 2
    assert parsed.living_people_count == 3
    assert parsed.focus_person_id in {person.id for person in parsed.people}

    people_by_id = {person.id: person for person in parsed.people}
    assert people_by_id["g-i1"].display_name == "Grace Hart"
    assert people_by_id["g-i1"].death_label == "Died 2011"
    assert people_by_id["g-i4"].birth_label == "Born 1986"
    assert people_by_id["g-i4"].is_living is True

    relationship_pairs = {
        (relationship.source_id, relationship.target_id, relationship.kind)
        for relationship in parsed.relationships
    }
    assert ("g-i2", "g-i3", "partner_of") in relationship_pairs
    assert ("g-i2", "g-i4", "parent_of") in relationship_pairs
    assert ("g-i3", "g-i4", "parent_of") in relationship_pairs


def test_parse_gedcom_infers_coordinates_by_generation():
    parsed = parse_gedcom(SAMPLE_GEDCOM, "sample.ged", "import123")
    people_by_id = {person.id: person for person in parsed.people}

    assert people_by_id["g-i1"].coordinate[1] > people_by_id["g-i2"].coordinate[1]
    assert people_by_id["g-i2"].coordinate[1] > people_by_id["g-i4"].coordinate[1]
