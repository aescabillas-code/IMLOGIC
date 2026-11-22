"""IM•LOGIC ⇄ PET message thread (im_pet_bridge.py, shared by both apps) and the background PET sync."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import im_pet_bridge as br  # noqa: E402
import streamlit_app as app  # noqa: E402


class Thread(unittest.TestCase):
    def setUp(self):
        self.db = br.FakeDB()

    def test_link_send_reply_feed(self):
        br.execute(self.db, "bridge_link", {"pet": "AR-1", "im": "IM-1", "imNo": "AR-1", "station": "CARE", "owner": "June"}, "IM")
        a = br.execute(self.db, "bridge_send", {"pet": "AR-1", "im": "IM-1", "text": "CE on the way", "by": "June"}, "IM")["msg"]
        b = br.execute(self.db, "bridge_send", {"pet": "AR-1", "text": "Thanks", "by": "Kim"}, "PET")["msg"]
        self.assertEqual((a["from"], b["from"], b["im"]), ("IM", "PET", "IM-1"))    # PET's reply finds the IM case from the link
        t = br.execute(self.db, "bridge_thread", {"pet": "AR-1"}, "PET")
        self.assertEqual([m["text"] for m in t["items"]], ["CE on the way", "Thanks"])
        self.assertEqual(t["link"]["station"], "CARE")
        f = br.execute(self.db, "bridge_feed", {"since": a["ts"] - 1, "pets": ["AR-1"]}, "IM")
        self.assertEqual(len(f["items"]), 2)
        self.assertEqual(br.execute(self.db, "bridge_feed", {"since": 0, "pets": ["XX"]}, "IM")["items"], [])
        self.assertEqual(len(br.execute(self.db, "bridge_feed", {"since": 0, "links": True}, "PET")["links"]), 1)

    def test_rules(self):
        for op, a in (("bridge_send", {"pet": "AR-1", "text": "  "}), ("bridge_send", {"text": "x"}), ("bridge_link", {"pet": "AR-1"}), ("nope", {})):
            with self.assertRaises(br.BridgeError):
                br.execute(self.db, op, a, "IM")
        with self.assertRaises(br.BridgeError):
            br.execute(None, "bridge_feed", {}, "IM")
        long = br.execute(self.db, "bridge_send", {"pet": "AR-1", "text": "x" * 5000}, "IM")["msg"]
        self.assertEqual(len(long["text"]), br.MAX_TEXT)

    def test_shared_file_between_two_servers(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "br.json")
            br.execute(br.FakeDB(f), "bridge_send", {"pet": "AR-2", "text": "from IM"}, "IM")
            self.assertEqual(br.execute(br.FakeDB(f), "bridge_thread", {"pet": "AR-2"}, "PET")["items"][0]["text"], "from IM")


class PetSync(unittest.TestCase):
    def test_only_changed_linked_cases(self):
        db = br.FakeDB()
        c = db["cases"]
        c.insert_one({"_id": "AR-1", "arubaNo": "AR-1", "mw": {"s": 1, "e": 2}, "_updated": 1000})
        c.insert_one({"_id": "AR-2", "arubaNo": "AR-2", "_updated": 500000})
        c.insert_one({"_id": "AR-3", "arubaNo": "AR-3", "_updated": 900000})
        r = app.pet_sync(["AR-1", "AR-2"], 0, c)
        self.assertEqual(sorted(x["id"] for x in r["items"]), ["AR-1", "AR-2"])                 # never a case not linked
        self.assertEqual([x for x in r["items"] if x["id"] == "AR-1"][0]["mw"], {"s": 1, "e": 2})
        r = app.pet_sync(["AR-1", "AR-2"], 400000 + 120000, c)                                  # changed since (2 min overlap)
        self.assertEqual([x["id"] for x in r["items"]], ["AR-2"])
        self.assertEqual(app.pet_sync([], 0, c)["items"], [])

    def test_execute_routes(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["BRIDGE_FAKE_FILE"] = os.path.join(d, "b.json")
            try:
                st = app.MemStore()
                m = app.execute(st, "bridge_send", {"pet": "AR-9", "text": "hi", "by": "J"})["msg"]
                self.assertEqual(m["from"], "IM")
                with self.assertRaises(app.ApiError):
                    app.execute(st, "bridge_send", {"pet": "AR-9", "text": ""})
            finally:
                del os.environ["BRIDGE_FAKE_FILE"]


if __name__ == "__main__":
    unittest.main()
