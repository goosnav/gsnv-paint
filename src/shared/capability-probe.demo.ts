import { capabilityProbe } from './capability-probe.ts';

const output = document.querySelector<HTMLPreElement>('#results')!;
output.textContent = JSON.stringify(await capabilityProbe({ environment: window, codecRequests: [] }), null, 2);
