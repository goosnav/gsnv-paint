import { installOfflineWorker, type OfflineWorkerScope } from '../shared/offline-worker.ts';
import type { OfflineManifest } from '../shared/offline-manifest.ts';
declare const __OFFLINE_MANIFEST__: OfflineManifest;
installOfflineWorker({ scope: self as unknown as OfflineWorkerScope, manifest: __OFFLINE_MANIFEST__ });
