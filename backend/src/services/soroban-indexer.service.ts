import { sorobanEventWorker } from '../workers/soroban-event-worker.js';

/** @deprecated Use sorobanEventWorker through workers/index.ts. */
export class SorobanIndexerService {
  start(): void {
    void sorobanEventWorker.start();
  }

  stop(): void {
    sorobanEventWorker.stop();
  }
}

export const sorobanIndexerService = new SorobanIndexerService();
