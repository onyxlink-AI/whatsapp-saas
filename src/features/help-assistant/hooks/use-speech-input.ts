"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Thin wrapper over the browser's native Web Speech API (SpeechRecognition)
 * — free, no API key, no server round-trip. Chrome/Edge support it well;
 * Firefox doesn't implement it at all and Safari's support is inconsistent,
 * so callers must check `isSupported` and hide the mic entirely when false.
 * Only transcribes to text — the assistant still replies in text, never audio.
 *
 * Also requires a secure context (HTTPS, or exactly "localhost") — the API
 * is unavailable (falls through to isSupported=false) on plain-HTTP hosts
 * like a LAN IP, matching the same constraint as crypto.randomUUID.
 */

interface SpeechRecognitionResultLike {
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Debes dar permiso de micrófono en tu navegador para poder hablar la pregunta.",
  "permission-denied": "Debes dar permiso de micrófono en tu navegador para poder hablar la pregunta.",
  "no-speech": "No se detectó voz, inténtalo de nuevo.",
  "audio-capture": "No se encontró un micrófono en este dispositivo.",
  network: "Error de red al reconocer la voz, inténtalo de nuevo.",
  aborted: "",
};

function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? "No se pudo usar el micrófono, inténtalo de nuevo.";
}

export function useSpeechInput(onTranscript: (text: string) => void, onError?: (message: string) => void) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: browser feature detection, must run after mount to avoid an SSR/hydration mismatch
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      onTranscript(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      setIsListening(false);
      const message = errorMessageFor(event.error);
      if (message) onError?.(message);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      onError?.(errorMessageFor(""));
    }
  }

  function stop() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  return { isSupported, isListening, start, stop };
}
