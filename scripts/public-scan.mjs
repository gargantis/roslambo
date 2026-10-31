#!/usr/bin/env node
// PLAN §13. The repo is public: the shared public-scan (vendor/hermet)
// looks for absolute home paths and key material in tracked text files,
// and (locally) for terms from a denylist kept OUTSIDE the repo via
// $ROSLAMBO_PRIVATE_TERMS. CI has no denylist and runs the built-in
// patterns only.
import { runPublicScan } from '../vendor/hermet/public-scan.mjs';

runPublicScan({ termsEnv: 'ROSLAMBO_PRIVATE_TERMS' });
