// mobile/src/ble/useHeartRate.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { createBandManager, type BandManagerHandle } from "./bandManager";
import { getPairedBand } from "../storage/pairedBand";
import type { HrSample } from "./hrAggregate";

export type HrStatus = "idle" | "no-band" | "connecting" | "connected" | "disconnected";

export function useHeartRate(nowFn: () => number = Date.now) {
  const [status, setStatus] = useState<HrStatus>("idle");
  const [bpm, setBpm] = useState<number | null>(null);
  const managerRef = useRef<BandManagerHandle | null>(null);
  const samplesRef = useRef<HrSample[]>([]);

  const connect = useCallback(async () => {
    const band = await getPairedBand();
    if (!band) {
      setStatus("no-band");
      return;
    }
    if (!managerRef.current) managerRef.current = createBandManager();
    setStatus("connecting");
    try {
      await managerRef.current.connect(band.deviceId, (b) => {
        samplesRef.current.push({ t: nowFn(), bpm: b });
        setBpm(b);
        setStatus("connected");
      });
    } catch {
      setStatus("disconnected");
    }
  }, [nowFn]);

  const disconnect = useCallback(async () => {
    await managerRef.current?.disconnect();
    setStatus("disconnected");
    setBpm(null);
  }, []);

  const getSamples = useCallback(() => samplesRef.current, []);
  const resetSamples = useCallback(() => {
    samplesRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, []);

  return { status, bpm, connect, disconnect, reconnect: connect, getSamples, resetSamples };
}
