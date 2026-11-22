"""Keep the IM•LOGIC Streamlit Cloud app awake (run by .github/workflows/keep_awake.yml).

A plain web request is not enough: a sleeping Streamlit Cloud app shows "This app has gone to sleep" and its
"Yes, get this app back up!" button must be clicked in a real browser. This script:
  1. opens the app in headless Chrome (the Chrome already on GitHub's runners; Playwright's own Chromium as a fallback),
  2. clicks the wake-up button wherever it is (the page or the frame inside it), also while the app is starting,
  3. reports the app awake only when the app itself answers: Streamlit's health check says "ok", or the app's own
     page (stApp / the IM•LOGIC frame) has loaded inside Streamlit Cloud's frame,
  4. tries three times; on failure it saves a screenshot and the page text in keep_awake_debug/ (uploaded by the
     workflow as an artifact) and prints a clear error.

Usage:  python tools/keep_awake.py https://your-app.streamlit.app      (or set APP_URL)
Options (environment): KEEP_AWAKE_ATTEMPTS (3), KEEP_AWAKE_WAIT (240 s per attempt), CHROME_PATH (a Chrome binary).
"""
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

WAKE = re.compile(r"get this app back up|wake (it|this app) (back )?up", re.I)
ASLEEP = re.compile(r"(app|this app) (has gone|is) (to )?sleep|zzzz", re.I)
UP_SELECTORS = ("#landing", "#stn-strip", "[data-testid='stApp']", ".stApp")   # IM•LOGIC's own page first, then Streamlit's
DEBUG = pathlib.Path(os.environ.get("KEEP_AWAKE_DEBUG", "keep_awake_debug"))


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def gh_error(msg: str) -> None:
    print(("::error::" if os.environ.get("GITHUB_ACTIONS") else "ERROR: ") + msg, flush=True)


def health_ok(url: str) -> bool:
    """Streamlit's own health check, through Streamlit Cloud's app path and directly."""
    base = url.rstrip("/")
    for path in ("/~/+/_stcore/health", "/_stcore/health", "/healthz"):
        try:
            req = urllib.request.Request(base + path, headers={"User-Agent": "Mozilla/5.0 keep-awake"})
            with urllib.request.urlopen(req, timeout=15) as r:
                if r.status == 200 and r.read(64).strip().lower() == b"ok":
                    return True
        except (urllib.error.URLError, OSError, ValueError):
            pass
    return False


def launch(pw):
    """GitHub's runners have Google Chrome: use it, so no browser download is needed. Fall back to Playwright's."""
    tries = []
    if os.environ.get("CHROME_PATH"):
        tries.append(dict(executable_path=os.environ["CHROME_PATH"]))
    tries += [dict(channel="chrome"), dict()]
    last = None
    for kw in tries:
        try:
            return pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"], **kw)
        except Exception as ex:  # noqa: BLE001
            last = ex
            log(f"Browser {kw or 'playwright-chromium'} not available: {str(ex).splitlines()[0][:160]}")
    raise RuntimeError(f"No browser could be started ({last})")


def click_wake(page) -> bool:
    for fr in page.frames:
        try:
            b = fr.get_by_role("button", name=WAKE)
            if b.count():
                b.first.click(timeout=10_000)
                return True
            b = fr.get_by_text(WAKE)
            if b.count():
                b.first.click(timeout=10_000)
                return True
        except Exception:  # noqa: BLE001  frame went away while we looked
            pass
    return False


def text_of(page) -> str:
    out = []
    for fr in page.frames:
        try:
            out.append(fr.evaluate("() => document.body ? document.body.innerText : ''")[:4000])
        except Exception:  # noqa: BLE001
            pass
    return "\n".join(out)


def app_loaded(page) -> bool:
    for fr in page.frames:
        try:
            for sel in UP_SELECTORS:
                if fr.locator(sel).count():
                    return True
        except Exception:  # noqa: BLE001
            pass
    return False


def save_debug(page, n: int) -> None:
    try:
        DEBUG.mkdir(exist_ok=True)
        page.screenshot(path=str(DEBUG / f"attempt{n}.png"), full_page=True)
        (DEBUG / f"attempt{n}.txt").write_text(f"URL: {page.url}\n\n{text_of(page)}", encoding="utf-8")
    except Exception as ex:  # noqa: BLE001
        log(f"Could not save the debug files: {ex}")


def visit(pw, url: str, n: int, wait_s: int) -> bool:
    browser = launch(pw)
    page = browser.new_context(viewport={"width": 1280, "height": 900}, user_agent="Mozilla/5.0 (X11; Linux x86_64) keep-awake").new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=120_000)
        clicked = False
        deadline = time.time() + wait_s
        while time.time() < deadline:
            page.wait_for_timeout(5_000)
            if click_wake(page):
                clicked = True
                log("The app was asleep: clicked the wake-up button")
                continue
            body = text_of(page)
            asleep = bool(ASLEEP.search(body))
            if not asleep and (health_ok(url) or app_loaded(page)):
                page.wait_for_timeout(8_000)            # let the app finish its first run
                if click_wake(page):                   # the sleep page came back: not awake yet
                    continue
                log(f"The app is awake{' (it was woken up)' if clicked else ''}: {page.title() or url}")
                return True
        gh_error(f"Attempt {n}: the app did not finish loading within {wait_s} s")
        save_debug(page, n)
        return False
    except Exception as ex:  # noqa: BLE001
        gh_error(f"Attempt {n}: {ex.__class__.__name__}: {str(ex)[:300]}")
        save_debug(page, n)
        return False
    finally:
        browser.close()


def main() -> int:
    url = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("APP_URL", "")).strip()
    if not url:
        gh_error("APP_URL is not set. Add the repository secret APP_URL (Settings > Secrets and variables > Actions) "
                 "with the IM•LOGIC app's address, e.g. https://your-app.streamlit.app")
        return 2
    if not re.match(r"^https?://", url):
        url = "https://" + url
    attempts = int(os.environ.get("KEEP_AWAKE_ATTEMPTS", "3"))
    wait_s = int(os.environ.get("KEEP_AWAKE_WAIT", "240"))
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        gh_error("Playwright is not installed (pip install playwright)")
        return 3
    with sync_playwright() as pw:
        for n in range(1, attempts + 1):            # a cold start can take a few minutes
            log(f"Attempt {n}/{attempts}: {url}")
            if visit(pw, url, n, wait_s):
                return 0
            if n < attempts:
                time.sleep(20)
    gh_error("The app could not be woken up. See the keep-awake-debug artifact (screenshot and page text) of this run.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
