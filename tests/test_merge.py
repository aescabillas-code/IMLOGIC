"""Saves from several screens at the same moment: list fields are merged on the server, nothing is lost."""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import streamlit_app as app  # noqa: E402


def it(i, t="x", **k):
    return dict(id=i, text=t, **k)


class ArrMerge(unittest.TestCase):
    def test_two_screens_add_at_the_same_moment(self):
        base = [it("req")]
        st = app.MemStore()
        st.put("cases", "C1", {"items": base, "model": ""})
        # both screens started from the same copy and save one after the other
        self.assertTrue(app.merged_patch(st, "cases", "C1", {"items": base + [it("a", "by agent")]}, {"items": base}))
        self.assertTrue(app.merged_patch(st, "cases", "C1", {"items": base + [it("m", "by manager")]}, {"items": base}))
        self.assertEqual([x["id"] for x in st.get("cases", "C1")["items"]], ["req", "a", "m"])

    def test_delete_and_edit_are_kept(self):
        base = [it("1"), it("2"), it("3")]
        rem = [it("1"), it("2"), it("3"), it("4")]
        loc = [it("1", "edited"), it("3")]                         # this screen edited 1 and deleted 2
        out = app.arr_merge(base, loc, rem)
        self.assertEqual([(x["id"], x["text"]) for x in out], [("1", "edited"), ("3", "x"), ("4", "x")])

    def test_no_base_is_a_plain_patch(self):
        st = app.MemStore()
        st.put("cases", "C2", {"items": [it("1")]})
        app.merged_patch(st, "cases", "C2", {"items": [it("9")]}, None)
        self.assertEqual(st.get("cases", "C2")["items"], [it("9")])

    def test_execute_strips_base(self):
        st = app.MemStore()
        st.put("cases", "C3", {"items": [it("1")]})
        app.execute(st, "patch", {"c": "cases", "id": "C3", "data": {"items": [it("1"), it("2")], "__base": {"items": [it("1")]}}})
        d = st.get("cases", "C3")
        self.assertNotIn("__base", d)
        self.assertEqual(len(d["items"]), 2)


class PetDates(unittest.TestCase):
    def test_draft_window_and_database_dates(self):
        doc = {"_id": "AR-1", "dft": {"f": {"mw-s": "2026-11-22T22:00", "mw-e": "2026-11-23T02:00"}},
               "ceArr": datetime.datetime(2026, 11, 22, 14, 0)}
        x = app.pet_shape(doc)
        self.assertEqual(x["mwDraft"], {"s": "2026-11-22T22:00", "e": "2026-11-23T02:00"})
        self.assertEqual(x["ceArr"], int(datetime.datetime(2026, 11, 22, 14, 0, tzinfo=datetime.timezone.utc).timestamp() * 1000))

    def test_saved_window_wins_over_draft(self):
        x = app.pet_shape({"_id": "AR-2", "mw": {"s": 1, "e": 2}, "dft": {"f": {"mw-s": "2026-11-22T22:00"}}})
        self.assertNotIn("mwDraft", x)
        self.assertEqual(x["mw"], {"s": 1, "e": 2})


if __name__ == "__main__":
    unittest.main()
