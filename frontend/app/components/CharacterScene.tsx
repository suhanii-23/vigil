"use client";

import { useEffect, useRef } from "react";

export default function CharacterScene() {
  const cameraRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number>(0);
  const idleRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetRef  = useRef({ rotY: 0, rotX: 0 });
  const currentRef = useRef({ rotY: 0, rotX: 0 });
  const scanRef    = useRef({ active: false, t: 0 });

  useEffect(() => {
    // ── Mouse tracking ─────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth  - 0.5) * 2;
      const my = (e.clientY / window.innerHeight - 0.5) * 2;

      targetRef.current.rotY = mx *  45;
      targetRef.current.rotX = my * -22;

      if (scanRef.current.active) {
        scanRef.current.active = false;
        scanRef.current.t = 0;
      }

      if (idleRef.current) clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => {
        scanRef.current.active = true;
        scanRef.current.t = 0;
      }, 3000);
    };

    window.addEventListener("mousemove", onMove);

    idleRef.current = setTimeout(() => {
      scanRef.current.active = true;
      scanRef.current.t = 0;
    }, 3000);

    // ── Idle surveillance scan ─────────────────────────────────────────────
    // Pattern: center → left → center → right → center (very slow, ~12s full cycle)
    const idleScan = (t: number): { rotY: number; rotX: number } => {
      const phase = (t % 12) / 12;
      let rotY = 0;
      if (phase < 0.2) rotY = -16 * (phase / 0.2);
      else if (phase < 0.4) rotY = -16 * (1 - (phase - 0.2) / 0.2);
      else if (phase < 0.6) rotY = 16 * ((phase - 0.4) / 0.2);
      else if (phase < 0.8) rotY = 16 * (1 - (phase - 0.6) / 0.2);
      return { rotY, rotX: 0 };
    };

    // ── RAF loop ──────────────────────────────────────────────────────────
    const LERP = 0.14;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const cur = currentRef.current;
      const tgt = targetRef.current;

      if (scanRef.current.active) {
        scanRef.current.t += dt;
        const scan = idleScan(scanRef.current.t);
        cur.rotY += (scan.rotY - cur.rotY) * 0.02;
        cur.rotX += (scan.rotX - cur.rotX) * 0.02;
      } else {
        cur.rotY += (tgt.rotY - cur.rotY) * LERP;
        cur.rotX += (tgt.rotX - cur.rotX) * LERP;
      }

      // Rotation only — position (left/top) stays put in CSS. transform-origin
      // (set in CSS below) is pinned to the head's actual neck-contact point,
      // not the box corner, so it pivots in place instead of swinging off
      // the body during rotation.
      if (cameraRef.current) {
        cameraRef.current.style.transform =
          `rotateX(${cur.rotX}deg) rotateY(${cur.rotY}deg)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes vigil-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-4px); }
        }

        /* ── Outer shell ────────────────────────────── */
        .vig-character {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          width: 100%;
          height: 100%;
          padding-bottom: 32px;
          perspective: 1200px;
          perspective-origin: 50% 40%;
        }

        /* ── Float wrapper ──────────────────────────── */
        .vig-float {
          position: relative;
          width: clamp(250px, 32vw, 430px);
          animation: vigil-float 6s ease-in-out infinite;
        }

        /* ── Ground shadow ──────────────────────────── */
        .vig-shadow {
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 220px;
          height: 32px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.12);
          filter: blur(28px);
          z-index: 0;
          pointer-events: none;
        }

        /* ── Body (static) ──────────────────────────── */
        /* Narrower than the float container and centered — the container
           itself still spans the full width so .vig-camera's percentages
           have a stable reference, but the jacket itself renders slimmer. */
        .vig-body {
          display: block;
          width: 76%;
          margin: 0 auto;
          position: relative;
          z-index: 1;
          user-select: none;
          -webkit-user-drag: none;
        }

        /* ── Camera head — tracks cursor ── */
        /*
          top/left are tuned against the actual cropped head.png/body.png
          content bounds so the head's visible bottom edge lands on the
          body's visible neckline (see backend crop script in project
          history). transform-origin is set to the head content's own
          bottom-center point (72% across, 98% down within its image, not
          50%/100% of the box) — the head shape isn't centered in its own
          bounding box, so a box-corner pivot made it swing away from the
          neck on every rotation. Pivoting at the real contact point keeps
          it visually anchored while it rotates.
        */
        .vig-camera {
          position: absolute;
          top: -68%;
          left: 17%;
          width: 60%;
          transform-origin: 72% 98%;
          will-change: transform;
          z-index: 10;
        }

        .vig-camera img {
          width: 100%;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
        }
      `}</style>

      <div className="vig-character">
        <div className="vig-float">

          {/* Ground shadow — outside float so it doesn't float */}
          <div className="vig-shadow" />

          {/* Body */}
          <img
            src="/assets/body.png"
            alt=""
            className="vig-body"
          />

          {/* Camera head — tracks cursor */}
          <div ref={cameraRef} className="vig-camera">
            <img
              src="/assets/head.png"
              alt="Vigil surveillance camera"
            />
          </div>

        </div>
      </div>
    </>
  );
}
