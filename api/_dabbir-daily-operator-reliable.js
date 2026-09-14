import {
  runDailyBusinessReview as runCoreDailyBusinessReview,
  runDailyOperatorBatch as runCoreDailyOperatorBatch,
} from './_dabbir-daily-operator-core.js';
import { createAiProviderAuthorityFetch } from './_ai-provider-authority-fetch.js';

export * from './_dabbir-daily-operator-core.js';

export async function runDailyBusinessReview(args={}){
  const env=args.env||process.env;
  const trace=[];
  const authorityFetch=createAiProviderAuthorityFetch({
    env,
    fetchImpl:args.fetchImpl||globalThis.fetch,
    healthStore:args.providerHealthStore,
    trace,
  });
  return runCoreDailyBusinessReview({...args,env,fetchImpl:authorityFetch});
}

export async function runDailyOperatorBatch(args={}){
  const env=args.env||process.env;
  const upstreamFetch=args.fetchImpl||globalThis.fetch;
  const providerHealthStore=args.providerHealthStore;
  const runner=args.runner||((runArgs)=>runDailyBusinessReview({...runArgs,env,fetchImpl:upstreamFetch,providerHealthStore}));
  return runCoreDailyOperatorBatch({...args,env,runner});
}
