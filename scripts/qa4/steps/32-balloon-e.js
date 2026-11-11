await H.snap('a/balloon2/at-pad');
await tap('KeyE', 30);
await H.snap('a/balloon2/after-E1');
log(await H.s(), await H.ui());
await st(600, false);
await tap('KeyE', 30);
await H.snap('a/balloon2/after-E2');
log(await H.s(), await H.ui());
