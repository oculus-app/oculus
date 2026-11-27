use crate::db::store::TOP_LEVEL_SUBJECT_ID;
use crate::library::layout::{
    category_of_path, derived_rel, own_path_ok, zone_of, DerivedKind, Zone, TOP_LEVEL_CODE,
};

/// The cases the TypeScript mirror (`libraryLayout.ts`) is checked against
/// too, and the constants migration 68 inserts.
const FIXTURE: &str = include_str!("../../../../../tests/fixtures/library/top_level.json");

fn fixture() -> serde_json::Value {
    serde_json::from_str(FIXTURE).unwrap()
}

#[test]
fn the_reserved_row_is_the_one_the_frontend_and_the_migration_name() {
    let fixture = fixture();
    assert_eq!(fixture["id"].as_i64(), Some(TOP_LEVEL_SUBJECT_ID));
    assert_eq!(fixture["code"].as_str(), Some(TOP_LEVEL_CODE));
    let migration = crate::db::migrations::all()
        .into_iter()
        .find(|m| m.version == 68)
        .expect("migration 68 inserts the row");
    assert!(migration
        .sql
        .contains(&format!("({TOP_LEVEL_SUBJECT_ID}, '{TOP_LEVEL_CODE}',")));
}

#[test]
fn the_shared_fixture_holds() {
    let fixture = fixture();
    for rel in fixture["own"].as_array().unwrap() {
        let rel = rel.as_str().unwrap();
        assert_eq!(zone_of(rel), Zone::Own, "{rel}");
        assert!(own_path_ok(rel), "{rel}");
    }
    for rel in fixture["not_own"].as_array().unwrap() {
        let rel = rel.as_str().unwrap();
        assert_ne!(zone_of(rel), Zone::Own, "{rel}");
        assert!(!own_path_ok(rel), "{rel}");
    }
    for case in fixture["categories"].as_array().unwrap() {
        let rel = case[0].as_str().unwrap();
        assert_eq!(category_of_path(rel), case[1].as_str().unwrap(), "{rel}");
    }
    for case in fixture["records"].as_array().unwrap() {
        let pdf = case[0].as_str().unwrap();
        assert_eq!(
            derived_rel(pdf, DerivedKind::Pages),
            case[1].as_str().unwrap(),
            "{pdf}"
        );
    }
}
