"use client";

import { useEffect, type CSSProperties } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

const SPRING = { stiffness: 52, damping: 22, mass: 0.85 };

const NEURAL_NODES = [
  { position: "one", left: "85%", top: "22%", size: "2.5rem", delay: 0, duration: 5.8, depth: "42px" },
  { position: "two", left: "93%", top: "49%", size: "2.85rem", delay: 0.7, duration: 6.6, depth: "68px" },
  { position: "three", left: "70%", top: "69%", size: "2.25rem", delay: 1.4, duration: 5.4, depth: "30px" },
  { position: "four", left: "63%", top: "35%", size: "3rem", delay: 2.1, duration: 7.2, depth: "82px" },
  { position: "five", left: "86%", top: "78%", size: "2.6rem", delay: 2.8, duration: 6.1, depth: "54px" },
  { position: "six", left: "57%", top: "55%", size: "2.15rem", delay: 3.5, duration: 7.6, depth: "24px" },
] as const;

export function AuthHeroMotion() {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, SPRING);
  const smoothY = useSpring(pointerY, SPRING);
  const rotateY = useTransform(smoothX, [-18, 18], [-1.4, 1.4]);
  const rotateX = useTransform(smoothY, [-12, 12], [1, -1]);
  const nodesX = useTransform(smoothX, [-18, 18], [9, -9]);
  const nodesY = useTransform(smoothY, [-12, 12], [6, -6]);

  useEffect(() => {
    if (reduceMotion) return;

    const followPointer = (event: PointerEvent) => {
      const horizontal = event.clientX / window.innerWidth - 0.5;
      const vertical = event.clientY / window.innerHeight - 0.5;
      pointerX.set(horizontal * 20);
      pointerY.set(vertical * 12);
    };

    const returnToCenter = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    window.addEventListener("pointermove", followPointer, { passive: true });
    window.addEventListener("pointerleave", returnToCenter);

    return () => {
      window.removeEventListener("pointermove", followPointer);
      window.removeEventListener("pointerleave", returnToCenter);
    };
  }, [pointerX, pointerY, reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <motion.div
        className="auth-hero__robot-glow"
        animate={reduceMotion ? undefined : { opacity: [0.62, 1, 0.62], scale: [0.96, 1.06, 0.96] }}
        transition={{ duration: 4.8, ease: "easeInOut", repeat: Infinity }}
      />

      <motion.div
        className="auth-hero__robot-stage"
        style={reduceMotion ? undefined : { x: smoothX, y: smoothY, rotateX, rotateY }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="relative h-full w-full"
          initial={reduceMotion ? false : { x: 32 }}
          animate={reduceMotion ? undefined : { x: 0, scale: [1.025, 1.035, 1.025] }}
          transition={{
            x: { duration: 1.15, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: 9, ease: "easeInOut", repeat: Infinity },
          }}
        >
          <Image
            src="/brand/onyxlink-robot-integrated-v2.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 58vw, 0px"
            className="auth-hero__robot"
            priority
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="auth-hero__scan"
        initial={false}
        animate={
          reduceMotion
            ? { top: "50%", opacity: 0.2 }
            : { top: ["12%", "12%", "88%", "88%"], opacity: [0, 0.85, 0.5, 0] }
        }
        transition={{ duration: 6.5, times: [0, 0.18, 0.78, 1], ease: "easeInOut", repeat: Infinity }}
      />

      <motion.div
        className="auth-neural-field"
        style={reduceMotion ? undefined : { x: nodesX, y: nodesY }}
      >
        <svg className="auth-neural-network" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="auth-neural-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#79CBCA" stopOpacity="0" />
              <stop offset="0.48" stopColor="#83CFCE" stopOpacity="0.78" />
              <stop offset="1" stopColor="#BFE7E6" stopOpacity="0.1" />
            </linearGradient>
            <filter id="auth-neural-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.45" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {[
            "M85 22 C77 25 70 29 63 35",
            "M63 35 C73 40 84 43 93 49",
            "M63 35 C61 43 59 49 57 55",
            "M57 55 C62 60 67 65 70 69",
            "M70 69 C77 72 82 75 86 78",
            "M93 49 C91 59 89 68 86 78",
          ].map((path, index) => (
            <motion.path
              key={path}
              d={path}
              pathLength="1"
              initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 0.35 } : { pathLength: [0.08, 1, 1], opacity: [0.08, 0.72, 0.16] }}
              transition={{ duration: 4.6, delay: index * 0.32, times: [0, 0.72, 1], ease: "easeInOut", repeat: Infinity, repeatDelay: 0.4 }}
            />
          ))}
        </svg>

        {NEURAL_NODES.map((node, index) => (
          <motion.span
            key={node.position}
            className={`auth-data-node auth-data-node--${node.position}`}
            style={{
              "--node-depth": node.depth,
              left: node.left,
              top: node.top,
              width: node.size,
              height: node.size,
            } as CSSProperties}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
            animate={
              reduceMotion
                ? { opacity: 0.86 }
                : {
                    opacity: [0.58, 1, 0.72, 0.58],
                    x: [0, index % 2 ? -7 : 8, index % 2 ? 4 : -3, 0],
                    y: [0, index % 2 ? 9 : -10, index % 3 ? -4 : 6, 0],
                    rotateX: [12, -18, 12],
                    rotateY: [-22, 24, -22],
                    scale: [0.92, 1.08, 0.98, 0.92],
                  }
            }
            transition={{ duration: node.duration, delay: node.delay, ease: "easeInOut", repeat: Infinity }}
          >
            <span className="auth-data-node__halo" />
            <span className="auth-data-node__sphere">
              <span className="auth-data-node__core" />
              <span className="auth-data-node__specular" />
            </span>
            <motion.span
              className="auth-data-node__orbit auth-data-node__orbit--one"
              animate={reduceMotion ? undefined : { rotateZ: 360 }}
              transition={{ duration: 4.2 + index * 0.24, ease: "linear", repeat: Infinity }}
            >
              <span className="auth-data-node__satellite" />
            </motion.span>
            <motion.span
              className="auth-data-node__orbit auth-data-node__orbit--two"
              animate={reduceMotion ? undefined : { rotateZ: -360 }}
              transition={{ duration: 5.8 + index * 0.2, ease: "linear", repeat: Infinity }}
            />
            <span className="auth-data-node__pulse" />
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}
