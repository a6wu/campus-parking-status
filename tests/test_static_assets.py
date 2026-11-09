from pathlib import Path


def test_static_assets_have_cache_busting_versions():
    static_dir = Path(__file__).parents[1] / "app" / "static"
    index = (static_dir / "index.html").read_text()
    app_js = (static_dir / "app.js").read_text()

    assert 'href="/static/styles.css?v=2365489"' in index
    assert 'src="/static/app.js?v=2365489"' in index
    assert 'from "./permit-totals.js?v=2365489"' in app_js
