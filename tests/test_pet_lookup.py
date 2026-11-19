"""IM•LOGIC: read-only PET Station lookup (pet_lookup / pet_get) against a fake PET "cases" collection."""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import streamlit_app as app  # noqa: E402


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(sorted(self, key=lambda d: d.get(key) or 0, reverse=direction < 0))

    def limit(self, n):
        return FakeCursor(self[:n])


class FakeColl:
    """Understands the query pet_query builds: {"$or": [{field: {"$regex", "$options"}}, ...]}."""

    def __init__(self, docs):
        self.docs = docs

    @staticmethod
    def _hit(doc, q):
        for cond in q["$or"]:
            (field, rx), = cond.items()
            pat = re.compile(rx["$regex"], re.I)
            v = doc.get(field)
            vals = v if isinstance(v, list) else [v]
            if any(isinstance(x, str) and pat.search(x) for x in vals):
                return True
        return False

    def find(self, q):
        return FakeCursor(d for d in self.docs if self._hit(d, q))

    def find_one(self, q):
        return next((d for d in self.docs if d["_id"] == q["_id"]), None)


DOCS = [
    {"_id": "AR-100200", "caseType": "aruba", "arubaNo": "AR-100200", "sfdc": ["5001", "5002"], "ritm": "RITM77", "sev": "Sev 2",
     "owner": "Kenjie Locsin", "closed": False, "recv": 2, "items": [{"done": True}, {"done": False}], "dft": {"x": 1}, "wk": {}},
    {"_id": "AR-1002001", "caseType": "aruba", "arubaNo": "AR-1002001", "sfdc": ["5003"], "owner": "Karen", "closed": True, "recv": 1},
    {"_id": "F-9", "caseType": "foundation", "sfdc": ["SFDC-555"], "owner": "Haina", "recv": 3},
]


class PetLookupTests(unittest.TestCase):
    def setUp(self):
        self.coll = FakeColl(DOCS)

    def test_several_matches_newest_first(self):
        r = app.pet_lookup("ar-100200", self.coll)
        self.assertEqual([x["id"] for x in r["items"]], ["AR-100200", "AR-1002001"])

    def test_search_by_sfdc_and_ritm(self):
        self.assertEqual([x["id"] for x in app.pet_lookup("SFDC-555", self.coll)["items"]], ["F-9"])
        self.assertEqual([x["id"] for x in app.pet_lookup("ritm77", self.coll)["items"]], ["AR-100200"])

    def test_shape_keeps_case_info_only(self):
        x = app.pet_lookup("5001", self.coll)["items"][0]
        self.assertEqual(x["chk"], [1, 2])
        self.assertEqual(x["sfdc"], ["5001", "5002"])
        self.assertNotIn("dft", x)
        self.assertNotIn("items", x)

    def test_too_short_and_special_characters(self):
        with self.assertRaises(app.ApiError):
            app.pet_lookup("ab", self.coll)
        self.assertEqual(app.pet_lookup("a.*b(", self.coll)["items"], [])   # regex characters are escaped

    def test_get_by_id(self):
        self.assertEqual(app.pet_get("F-9", self.coll)["item"]["owner"], "Haina")
        self.assertIsNone(app.pet_get("nope", self.coll)["item"])

    def test_execute_routes_to_the_pet_database(self):
        old = app._PET["coll"]
        app._PET["coll"] = self.coll
        try:
            r = app.execute(app.MemStore(), "pet_lookup", {"q": "AR-100200"})
            self.assertEqual(len(r["items"]), 2)
            self.assertEqual(app.execute(app.MemStore(), "pet_get", {"id": "AR-100200"})["item"]["owner"], "Kenjie Locsin")
        finally:
            app._PET["coll"] = old

    def test_pet_database_defaults(self):
        keep = {k: os.environ.pop(k, None) for k in ("PET_MONGODB_URI", "PET_MONGODB_DB", "MONGODB_URI", "MONGO_URI")}
        try:
            os.environ["MONGODB_URI"] = "mongodb://h:27017"
            uri, db, problem = app.pet_settings()
            self.assertEqual((uri, db, problem), ("mongodb://h:27017", "pet_station", None))
            os.environ["PET_MONGODB_URI"] = "mongodb://pet:27017"
            os.environ["PET_MONGODB_DB"] = "pat"
            self.assertEqual(app.pet_settings(), ("mongodb://pet:27017", "pat", None))
        finally:
            for k, v in keep.items():
                os.environ.pop(k, None)
                if v is not None:
                    os.environ[k] = v


if __name__ == "__main__":
    unittest.main()
