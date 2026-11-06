// NAME: FadeGlide
// AUTHOR: you
// VERSION: 1.3.0
// DESCRIPTION: Fade-out / fade-in transitions between tracks for Spotify free (volume based).

/// <reference path="../cli/globals.d.ts" />

(async function FadeGlide() {
    if (
        !Spicetify?.Player?.addEventListener ||
        !Spicetify?.Player?.getVolume ||
        !Spicetify?.Player?.setVolume ||
        !Spicetify?.LocalStorage ||
        !Spicetify?.Menu ||
        !Spicetify?.PopupModal
    ) {
        setTimeout(FadeGlide, 300);
        return;
    }

    const KEY = { ON: "fadeglide:on", SEC: "fadeglide:sec", GAPLESS: "fadeglide:albumGapless" };
    const TICK_MS = 40;
    const IN_RATIO = 0.6;
    const IN_FLOOR = 0.04;
    const CURVE_K = 3;
    const USER_TOL = 0.05;

    let enabled = true;
    let fadeSec = 5;
    let albumGapless = true;

    // phase: idle | out | held | inwait | in
    let phase = "idle";
    let baseVolume = null;
    let lastSet = null;
    let recentSets = [];
    let mismatch = 0;
    let outMs = 5000;
    let heldAt = 0;
    let armedAt = 0;
    let fadeInStart = 0;
    let skipUri = null;
    let lastPos = 0, lastStamp = 0;

    // ── Settings ───────────────────────────────────────────────────
    function load() {
        try {
            const on = Spicetify.LocalStorage.get(KEY.ON);
            if (on !== null) enabled = on === "true";
            const s = parseFloat(Spicetify.LocalStorage.get(KEY.SEC));
            if (!isNaN(s) && s >= 1 && s <= 12) fadeSec = s;
            const g = Spicetify.LocalStorage.get(KEY.GAPLESS);
            if (g !== null) albumGapless = g === "true";
        } catch (_) {}
    }
    function save() {
        try {
            Spicetify.LocalStorage.set(KEY.ON, String(enabled));
            Spicetify.LocalStorage.set(KEY.SEC, String(fadeSec));
            Spicetify.LocalStorage.set(KEY.GAPLESS, String(albumGapless));
        } catch (_) {}
    }

    // ── Volume helpers ─────────────────────────────────────────────
    const setVol = (v) => {
        v = Math.max(0, Math.min(1, v));
        lastSet = v;
        recentSets.push(v);
        if (recentSets.length > 12) recentSets.shift();
        Spicetify.Player.setVolume(v);
    };

    // The player reports volume with a delay, so only treat a reading as "user moved the slider"
    // if it matches none of our recent writes and isn't the original volume, for 5 ticks in a row.
    function userChangedVolume() {
        if (lastSet === null) return false;
        const v = Spicetify.Player.getVolume();
        const near = recentSets.some((x) => Math.abs(v - x) <= USER_TOL);
        const staleBase = baseVolume !== null && Math.abs(v - baseVolume) <= 0.02;
        if (near || staleBase) { mismatch = 0; return false; }
        return ++mismatch >= 5;
    }

    function resetVolState() {
        baseVolume = null;
        lastSet = null;
        recentSets = [];
        mismatch = 0;
    }
    function restore() {
        if (baseVolume !== null) setVol(baseVolume);
        resetVolState();
        phase = "idle";
    }
    function abandon() {
        resetVolState();
        phase = "idle";
    }

    const expCurve = (t) => {
        t = Math.max(0, Math.min(1, t));
        return (Math.exp(CURVE_K * t) - 1) / (Math.exp(CURVE_K) - 1);
    };
    const gainOut = (t) => expCurve(1 - t);
    const gainIn = (t) => IN_FLOOR + (1 - IN_FLOOR) * expCurve(t);

    // ── Track info ─────────────────────────────────────────────────
    const curUri = () => Spicetify.Player.data?.item?.uri || null;

    function isAd() {
        const item = Spicetify.Player.data?.item;
        if (!item) return false;
        return item.type === "ad" || item.isAd === true || item.uri?.startsWith("spotify:ad");
    }

    function sameAlbumNext() {
        try {
            const cur = Spicetify.Player.data?.item?.album?.uri;
            const next = Spicetify.Queue?.nextTracks?.[0]?.contextTrack?.metadata?.album_uri;
            const repeatOne = Spicetify.Player.getRepeat?.() === 2;
            return !repeatOne && cur && next && cur === next;
        } catch (_) { return false; }
    }

    function estPos(playing) {
        const p = Spicetify.Player.getProgress();
        const now = performance.now();
        if (p !== lastPos) { lastPos = p; lastStamp = now; }
        return playing ? lastPos + Math.min(now - lastStamp, 1000) : lastPos;
    }

    // ── Main loop ──────────────────────────────────────────────────
    function tick() {
        if (!enabled) { if (phase !== "idle") restore(); return; }

        const playing = Spicetify.Player.isPlaying();
        const dur = Spicetify.Player.getDuration();
        const pos = estPos(playing);
        const remaining = dur - pos;

        if (phase === "idle") {
            if (!playing || isAd() || !dur) return;

            const uri = curUri();
            const fadeMs = fadeSec * 1000;
            if (pos < 3000) return;
            if (remaining > fadeMs || remaining <= 0) return;
            if (uri && uri === skipUri) return;
            if (dur < fadeMs * 3) { skipUri = uri; return; }
            if (albumGapless && sameAlbumNext()) { skipUri = uri; return; }

            const v = Spicetify.Player.getVolume();
            if (!(v > 0)) { skipUri = uri; return; }
            resetVolState();
            baseVolume = v;
            outMs = fadeMs;
            phase = "out";
            return;
        }

        if (phase === "out") {
            if (!playing || remaining > outMs + 1500) { restore(); return; }   // paused or seeked back
            if (userChangedVolume()) { abandon(); return; }
            const t = 1 - Math.max(0, remaining) / outMs;
            setVol(baseVolume * gainOut(t));
            if (remaining <= 150) { phase = "held"; heldAt = Date.now(); setVol(0); }
            return;
        }

        if (phase === "held") {
            if (Date.now() - heldAt > 4000) restore();   // track change never came
            return;
        }

        if (phase === "inwait") {
            // start the ramp only once the new track is actually playing
            const p = Spicetify.Player.getProgress();
            if (p > 120 || Date.now() - armedAt > 2500) {
                fadeInStart = Date.now();
                phase = "in";
            }
            return;
        }

        if (phase === "in") {
            if (userChangedVolume()) { abandon(); return; }
            const t = (Date.now() - fadeInStart) / (fadeSec * 1000 * IN_RATIO);
            if (t >= 1) { restore(); return; }
            setVol(baseVolume * gainIn(t));
        }
    }

    function onSongChange() {
        lastPos = 0; lastStamp = performance.now();
        if (skipUri !== curUri()) skipUri = null;
        if (phase !== "out" && phase !== "held") return;
        if (baseVolume === null) { phase = "idle"; return; }
        setVol(0);
        armedAt = Date.now();
        phase = "inwait";
    }

    function onPlayPause() {
        if (!Spicetify.Player.isPlaying() && phase !== "idle") restore();
    }

    // ── UI ─────────────────────────────────────────────────────────
    const ICON = `<svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor">
        <path d="M1 8c1.5 0 2-5 3.5-5S6 13 7.5 13 9 3 10.5 3 12 8 15 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;

    let playbarBtn = null;
    let menuItem = null;

    function refreshEntryPoints() {
        try {
            if (playbarBtn) {
                playbarBtn.active = enabled;
                playbarBtn.label = enabled ? `FadeGlide: ${fadeSec}s` : "FadeGlide: off";
            }
            if (menuItem) menuItem.setState(enabled);
        } catch (_) {}
    }

    function setEnabled(v) {
        enabled = v;
        if (!enabled) restore();
        save();
        refreshEntryPoints();
    }

    function openSettings() {
        const el = document.createElement("div");
        el.innerHTML = `
            <style>
                .fg{font-family:var(--font-family,'CircularSp',sans-serif);color:var(--spice-text,#fff);padding:4px 0}
                .fg__row{display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px}
                .fg__lbl{font-size:14px;font-weight:700}
                .fg__val{font-size:14px;font-weight:700;color:var(--spice-button,#1db954)}
                .fg__sl{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:var(--spice-button-disabled,#535353);outline:none;cursor:pointer;margin:10px 0 4px}
                .fg__sl::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:var(--spice-button,#1db954);cursor:pointer}
                .fg__ticks{display:flex;justify-content:space-between;font-size:10px;color:var(--spice-subtext,#b3b3b3);opacity:.6}
                .fg__tgl{position:relative;width:38px;height:20px;background:var(--spice-button-disabled,#535353);border-radius:10px;border:none;cursor:pointer;padding:0;flex-shrink:0;transition:background .2s}
                .fg__tgl.on{background:var(--spice-button,#1db954)}
                .fg__tgl::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
                .fg__tgl.on::after{transform:translateX(18px)}
            </style>
            <div class="fg">
                <div class="fg__row" style="margin-top:0">
                    <span class="fg__lbl">Enable FadeGlide</span>
                    <button class="fg__tgl ${enabled ? "on" : ""}" id="fg-en"></button>
                </div>

                <div class="fg__row">
                    <span class="fg__lbl">Fade length</span>
                    <span class="fg__val" id="fg-val">${fadeSec}s</span>
                </div>
                <input type="range" class="fg__sl" id="fg-sl" min="1" max="12" step="0.5" value="${fadeSec}"/>
                <div class="fg__ticks"><span>1s</span><span>4s</span><span>8s</span><span>12s</span></div>

                <div class="fg__row">
                    <span class="fg__lbl">Keep albums gapless</span>
                    <button class="fg__tgl ${albumGapless ? "on" : ""}" id="fg-gap"></button>
                </div>
            </div>`;

        const bindToggle = (id, get, set) => {
            const b = el.querySelector(id);
            b.addEventListener("click", () => { set(!get()); b.classList.toggle("on", get()); });
        };
        bindToggle("#fg-en", () => enabled, (v) => setEnabled(v));
        bindToggle("#fg-gap", () => albumGapless, (v) => { albumGapless = v; save(); });

        const sl = el.querySelector("#fg-sl");
        const val = el.querySelector("#fg-val");
        sl.addEventListener("input", () => {
            fadeSec = parseFloat(sl.value);
            val.textContent = `${fadeSec}s`;
            save();
            refreshEntryPoints();
        });

        Spicetify.PopupModal.display({ title: "FadeGlide", content: el });
    }

    function initUI() {
        try {
            if (Spicetify.Playbar?.Button) {
                playbarBtn = new Spicetify.Playbar.Button(
                    enabled ? `FadeGlide: ${fadeSec}s` : "FadeGlide: off",
                    ICON,
                    () => openSettings(),
                    false,
                    enabled,
                    true
                );
            }
        } catch (e) { console.warn("[FadeGlide] playbar button failed:", e); }

        try {
            menuItem = new Spicetify.Menu.Item("FadeGlide settings", enabled, () => openSettings());
            menuItem.register();
        } catch (e) { console.warn("[FadeGlide] menu item failed:", e); }
    }

    load();
    initUI();
    Spicetify.Player.addEventListener("songchange", onSongChange);
    Spicetify.Player.addEventListener("onplaypause", onPlayPause);
    setInterval(tick, TICK_MS);
    window.addEventListener("beforeunload", () => { if (phase !== "idle") restore(); });
})();