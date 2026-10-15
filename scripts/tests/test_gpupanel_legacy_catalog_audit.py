from pathlib import Path
import importlib.util
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("gpupanel_legacy_audit",ROOT/"scripts/gpupanel-legacy-catalog-audit.py")
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class AuditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir=Path(self.temp.name)
        self.db=self.dir/"agent.db"
        c=sqlite3.connect(self.db)
        c.executescript("""
          CREATE TABLE apps (id INTEGER PRIMARY KEY, resource TEXT, key TEXT);
          CREATE TABLE app_installs (id INTEGER PRIMARY KEY, app_id INTEGER);
          CREATE TABLE app_details (id INTEGER PRIMARY KEY, app_id INTEGER);
          INSERT INTO apps VALUES (1,'remote','legacy-a'),(2,'remote','legacy-b'),
                                  (3,'local','local-c');
          INSERT INTO app_installs VALUES (10,1),(11,1),(12,3);
          INSERT INTO app_details VALUES (20,1),(21,2),(22,3);
        """)
        c.commit()
        c.close()

    def test_counts_without_touching_database(self):
        before=self.db.read_bytes()
        report=audit.inspect(self.db)
        self.assertEqual(report["legacyRemoteDefinitions"],2)
        self.assertEqual(report["legacyRemoteDefinitionsWithInstallations"],1)
        self.assertEqual(report["legacyInstallationRecords"],2)
        self.assertEqual(report["legacyRemoteDefinitionsWithoutInstallation"],1)
        self.assertEqual(report["legacyRemoteDetailRows"],2)
        self.assertFalse(report["candidateForAutomaticDeletion"])
        self.assertEqual(report["recordsModified"],0)
        self.assertEqual(before,self.db.read_bytes())
        self.assertNotIn("legacy-a",str(report))

    def test_dangling_installed_app_reference_reported(self):
        c=sqlite3.connect(self.db)
        c.execute("INSERT INTO app_installs VALUES (13,999)")
        c.commit();c.close()
        self.assertEqual(audit.inspect(self.db)["orphanedInstallationReferences"],1)

    def test_missing_database_does_not_create_one(self):
        missing=self.dir/"not-found.db"
        with self.assertRaises(audit.AuditError):
            audit.inspect(missing)
        self.assertFalse(missing.exists())

    def test_symlink_refused(self):
        link=self.dir/"link.db"
        link.symlink_to(self.db)
        with self.assertRaises(audit.AuditError):
            audit.inspect(link)

    def test_incompatible_schema_refused(self):
        c=sqlite3.connect(self.db)
        c.execute("DROP TABLE app_details")
        c.commit();c.close()
        with self.assertRaises(audit.AuditError):
            audit.inspect(self.db)

    def test_readonly_even_when_sql_write_is_attempted(self):
        before=self.db.read_bytes()
        original=audit.sqlite3.connect
        def guard(*args,**kwargs):
            self.assertIn("mode=ro",args[0])
            self.assertTrue(kwargs.get("uri"))
            return original(*args,**kwargs)
        with patch.object(audit.sqlite3,"connect",side_effect=guard):
            audit.inspect(self.db)
        self.assertEqual(before,self.db.read_bytes())

if __name__=="__main__":
    unittest.main()
