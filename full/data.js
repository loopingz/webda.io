window.BENCHMARK_DATA = {
  "lastUpdate": 1794725532903,
  "repoUrl": "https://github.com/loopingz/webda.io",
  "entries": {
    "Throughput (full)": [
      {
        "commit": {
          "author": {
            "name": "Remi Cattiau",
            "username": "loopingz",
            "email": "remi@cattiau.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "8d10d46900d0d709a1164520555574d50c3b03c6",
          "message": "fix(utils,mcp): resolve the browser entry and declare @webda/utils at runtime (#1086)\n\n- @webda/utils: list the `browser` condition before `node`/`import`/\n  `require` in `exports`. Conditions match in object order, so a browser\n  bundler (Vite, esbuild, webpack: `browser` + `import`) picked\n  lib/index.js, the Node entry, instead of lib/browser.js.\n- @webda/mcp: src/invoke.ts imports `@webda/utils` at runtime, but it was\n  only a devDependency. Strict installers (pnpm without hoisting, Bazel\n  runfiles) do not link it beside the published package and the import\n  fails with ERR_MODULE_NOT_FOUND. Move it to `dependencies`.\n\nEach fix has a regression spec (utils exports.spec.ts, mcp package.spec.ts).\n\nCo-authored-by: Coding LoopCenter <coding-loopcenter@agents.my.loopingz.com>\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
          "timestamp": "2026-11-14T21:15:01Z",
          "url": "https://github.com/loopingz/webda.io/commit/8d10d46900d0d709a1164520555574d50c3b03c6"
        },
        "date": 1794725528361,
        "tool": "customBiggerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 210009.03,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.004ms max=0.604ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 192600.3,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.038ms max=1.305ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=50,subscribers=0] throughput",
            "value": 193027.83,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.191ms max=1.901ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.33ms max=3.16ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] throughput",
            "value": 999.89,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.574ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] throughput",
            "value": 43284.8,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=99.942ms max=193.593ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=10000,subscribers=1] throughput",
            "value": 47959.1,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=104.464ms max=167.641ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=2000,subscribers=5] throughput",
            "value": 69385.66,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=84.41ms max=136.839ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=500,subscribers=20] throughput",
            "value": 68353.63,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=88.998ms max=144.441ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 3948.7,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.249ms max=0.376ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 3013.47,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.315ms max=5.034ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] throughput",
            "value": 479.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.552ms max=12.354ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 140280,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.006ms max=3.256ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 175343.23,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.042ms max=0.935ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 181672.84,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.21ms max=5.722ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 412.23,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12155.093ms max=24259.854ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 433.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=11609.833ms max=23068.672ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 1970.26,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2613.051ms max=5079.302ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 1975.7,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2600.468ms max=5062.525ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 3674.02,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1445.986ms max=2722.103ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 3710.8,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1420.82ms max=2696.937ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 99.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.07ms max=41.353ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 996.9,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=22.97ms max=165.282ms"
          },
          {
            "name": "queue/AMQPQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 4.43,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1002.439ms max=1041.236ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 437.34,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.238ms max=423.625ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 777.04,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=11.715ms max=429.392ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 824.47,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=53.117ms max=510.919ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=10000] throughput",
            "value": 402.99,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=18874.368ms max=25048.383ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=10000] throughput",
            "value": 712.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=13027.508ms max=14101.25ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=50,messages=10000] throughput",
            "value": 730.19,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12717.13ms max=14143.193ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 117.26,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=44862.276ms max=85362.475ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 117.16,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=43587.207ms max=85429.584ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 346.45,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=20182.991ms max=28890.366ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 170.32,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=37245.42ms max=58753.81ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 542.61,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=15040.774ms max=18471.715ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 214.77,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=29125.247ms max=46607.106ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.156ms max=18.055ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 350.31,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=15627.977ms max=18555.601ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 3.66,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1202.717ms max=1335.886ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 286861.73,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=1.094ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 305203.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.029ms max=0.323ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 300824.26,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.144ms max=1.737ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=10000] throughput",
            "value": 2477.67,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3175.088ms max=4037.018ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=10000] throughput",
            "value": 2599.1,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3149.922ms max=3848.274ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=50,messages=10000] throughput",
            "value": 2725.21,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3112.174ms max=3670.016ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 398.78,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=13765.706ms max=25081.938ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 394.9,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=13639.877ms max=25333.596ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 1573.66,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3745.513ms max=6358.565ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 1555.36,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3749.708ms max=6429.868ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 2007.41,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3374.318ms max=4982.833ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 1994.97,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3391.095ms max=5016.388ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.044ms max=350.487ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 999.96,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=9.028ms"
          },
          {
            "name": "queue/MemoryQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 2.5,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=2000.683ms max=2000.683ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 137912.01,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.006ms max=1.659ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 435085.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.04ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 84745.04,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.011ms max=1.444ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 45227.79,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.015ms max=1.465ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 46607.88,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.015ms max=1.622ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 41461.43,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.018ms max=1.583ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 26840.09,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.036ms max=1.944ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 712.58,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=1.362ms max=2.658ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 279.62,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=3.539ms max=5.718ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 1241.45,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=0.786ms max=1.488ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 12.83,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=77.66ms max=142.737ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 31172.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.03ms max=2.564ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 729128.69,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.445ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 187592.62,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.052ms max=0.697ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 419797.66,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.023ms max=0.124ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 97917.3,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.098ms max=1.12ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 50131.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.193ms max=1.667ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 50998.03,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.188ms max=2.013ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 46178.07,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.21ms max=1.932ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 27796.23,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.353ms max=2.419ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 634.4,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=15.458ms max=17.859ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 255.13,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=38.765ms max=45.613ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 1132.66,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=8.208ms max=18.334ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 10.15,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=981.467ms max=1028.129ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 31843.48,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.303ms max=3.408ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 725794.75,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=0.401ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 30315.25,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.325ms max=1.346ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 198137.51,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.247ms max=0.459ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 427040.18,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.109ms max=0.582ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 99095.26,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.483ms max=1.985ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 53905.74,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.914ms max=2.378ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 55315.55,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.884ms max=2.337ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 45584.25,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.055ms max=2.402ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 28243.56,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.879ms max=3.445ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 673.64,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=74.318ms max=75.301ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 243.18,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=200.933ms max=238.289ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 1163.18,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=43.418ms max=46.891ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 8.18,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=6106.907ms max=6169.821ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 31636.56,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.534ms max=4.669ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 783821.92,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.06ms max=0.475ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 30431.12,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.623ms max=2.552ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 4.44,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=219.283ms max=241.304ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 4.48,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=219.677ms max=240.779ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 5.11,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=194.642ms max=199.098ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=small] throughput",
            "value": 8.52,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=116.523ms max=121.831ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 70133.6,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.013ms max=2.529ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 429037.24,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.036ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 57047.67,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.019ms max=1.37ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 33987.94,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.015ms max=3.426ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 32791.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.015ms max=8.782ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 31094.53,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.019ms max=3.557ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 16432.37,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.058ms max=3.836ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 364.12,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=2.685ms max=4.362ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 130.1,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=7.606ms max=12.878ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 643.88,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=1.509ms max=2.777ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 5.71,
            "unit": "ops/s",
            "extra": "ops=343 errors=0 p50=173.933ms max=205.521ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 20225.47,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.045ms max=4.895ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 521458,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.001ms max=5.14ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 97153.41,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.1ms max=1.22ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 413086.58,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.022ms max=0.802ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 66094.29,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.144ms max=1.611ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 41335.12,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.764ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 40736.35,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.51ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 36636.75,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.257ms max=3.437ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 16183.35,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.563ms max=7.823ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 334.85,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=28.819ms max=69.337ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 125.17,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=77.595ms max=114.819ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 668.37,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=13.984ms max=40.927ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 4.46,
            "unit": "ops/s",
            "extra": "ops=270 errors=0 p50=2239.758ms max=2300.576ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 20332.64,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.452ms max=7.111ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 676452.68,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=0.379ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 18425.95,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.53ms max=2.37ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 102027.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.468ms max=1.816ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 410896.99,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.113ms max=1.305ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 67433.61,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.707ms max=2.832ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 41007.98,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.11ms max=15.024ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 44948.47,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.074ms max=4.461ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 37464.69,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.276ms max=4.653ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 16366.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3.021ms max=9.183ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 326.67,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=149.029ms max=183.108ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 124.48,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=396.624ms max=432.013ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 642.99,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=77.332ms max=83.624ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 3.41,
            "unit": "ops/s",
            "extra": "ops=250 errors=0 p50=14629.732ms max=14805.893ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 19986.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.255ms max=9.773ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 746770.22,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.058ms max=0.353ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 18510.6,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.644ms max=4.534ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 2.46,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=380.109ms max=466.616ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 2.51,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=379.585ms max=432.8ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 2.41,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=416.547ms max=418.12ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=large] throughput",
            "value": 3.56,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=280.756ms max=301.728ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 178881.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.005ms max=3.445ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 291894.1,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.03ms max=0.111ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=50,subscribers=0] throughput",
            "value": 312695.43,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.148ms max=0.998ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.083ms max=0.564ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] throughput",
            "value": 999.97,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.021ms max=3.238ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] throughput",
            "value": 173583.99,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=29.95ms max=32.326ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=10000,subscribers=1] throughput",
            "value": 165527.29,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=28.525ms max=38.044ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=2000,subscribers=5] throughput",
            "value": 267630.14,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=18.842ms max=28ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=500,subscribers=20] throughput",
            "value": 259356.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=19.661ms max=29.983ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 9005.76,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.143ms max=0.588ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 3442.92,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.418ms max=0.973ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] throughput",
            "value": 74.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=15.254ms max=39.879ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 33679.11,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.027ms max=3.576ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 38890.38,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.254ms max=1.726ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 39882.59,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.252ms max=2.066ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.08,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.633ms max=3.547ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 999.78,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.316ms max=10.715ms"
          },
          {
            "name": "queue/FileQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 0.5,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1025.507ms max=1051.722ms"
          }
        ]
      }
    ],
    "p99 latency (full)": [
      {
        "commit": {
          "author": {
            "name": "Remi Cattiau",
            "username": "loopingz",
            "email": "remi@cattiau.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "8d10d46900d0d709a1164520555574d50c3b03c6",
          "message": "fix(utils,mcp): resolve the browser entry and declare @webda/utils at runtime (#1086)\n\n- @webda/utils: list the `browser` condition before `node`/`import`/\n  `require` in `exports`. Conditions match in object order, so a browser\n  bundler (Vite, esbuild, webpack: `browser` + `import`) picked\n  lib/index.js, the Node entry, instead of lib/browser.js.\n- @webda/mcp: src/invoke.ts imports `@webda/utils` at runtime, but it was\n  only a devDependency. Strict installers (pnpm without hoisting, Bazel\n  runfiles) do not link it beside the published package and the import\n  fails with ERR_MODULE_NOT_FOUND. Move it to `dependencies`.\n\nEach fix has a regression spec (utils exports.spec.ts, mcp package.spec.ts).\n\nCo-authored-by: Coding LoopCenter <coding-loopcenter@agents.my.loopingz.com>\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
          "timestamp": "2026-11-14T21:15:01Z",
          "url": "https://github.com/loopingz/webda.io/commit/8d10d46900d0d709a1164520555574d50c3b03c6"
        },
        "date": 1794725532074,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.013,
            "range": "± 0.006",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.004ms max=0.604ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.132,
            "range": "± 0.046",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.038ms max=1.305ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=50,subscribers=0] p99",
            "value": 0.596,
            "range": "± 0.159",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.191ms max=1.901ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.556,
            "range": "± 0.116",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.33ms max=3.16ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] p99",
            "value": 0.396,
            "range": "± 0.096",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.574ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] p99",
            "value": 193.331,
            "range": "± 42.645",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=99.942ms max=193.593ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=10000,subscribers=1] p99",
            "value": 165.413,
            "range": "± 26.678",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=104.464ms max=167.641ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=2000,subscribers=5] p99",
            "value": 136.446,
            "range": "± 36.098",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=84.41ms max=136.839ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=500,subscribers=20] p99",
            "value": 144.441,
            "range": "± 43.828",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=88.998ms max=144.441ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.324,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.249ms max=0.376ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.394,
            "range": "± 0.177",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.315ms max=5.034ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] p99",
            "value": 7.123,
            "range": "± 1.264",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.552ms max=12.354ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.024,
            "range": "± 0.033",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.006ms max=3.256ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.163,
            "range": "± 0.038",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.042ms max=0.935ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 0.518,
            "range": "± 0.386",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.21ms max=5.722ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 24041.751,
            "range": "± 7003.366",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12155.093ms max=24259.854ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 22833.791,
            "range": "± 6609.703",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=11609.833ms max=23068.672ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 5028.97,
            "range": "± 1421.477",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2613.051ms max=5079.302ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 5012.193,
            "range": "± 1422.599",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2600.468ms max=5062.525ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 2699.035,
            "range": "± 742.643",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1445.986ms max=2722.103ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 2671.772,
            "range": "± 738.354",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1420.82ms max=2696.937ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 40.96,
            "range": "± 11.812",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=21.07ms max=41.353ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 117.047,
            "range": "± 20.878",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=22.97ms max=165.282ms"
          },
          {
            "name": "queue/AMQPQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1041.236,
            "range": "± 19.278",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1002.439ms max=1041.236ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 4.041,
            "range": "± 4.255",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.238ms max=423.625ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 22.856,
            "range": "± 13.575",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=11.715ms max=429.392ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 467.665,
            "range": "± 51.195",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=53.117ms max=510.919ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=10000] p99",
            "value": 24897.389,
            "range": "± 3651.161",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=18874.368ms max=25048.383ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=10000] p99",
            "value": 14034.141,
            "range": "± 577.13",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=13027.508ms max=14101.25ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=50,messages=10000] p99",
            "value": 13874.758,
            "range": "± 445.52",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12717.13ms max=14143.193ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 84624.278,
            "range": "± 21168.836",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=44862.276ms max=85362.475ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 84490.06,
            "range": "± 20982.164",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=43587.207ms max=85429.584ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 28739.371,
            "range": "± 4847.197",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=20182.991ms max=28890.366ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 58317.603,
            "range": "± 13236.123",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=37245.42ms max=58753.81ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 18387.829,
            "range": "± 1963.71",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=15040.774ms max=18471.715ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 46238.007,
            "range": "± 10119.336",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=29125.247ms max=46607.106ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 6.861,
            "range": "± 1.112",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.156ms max=18.055ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 18505.269,
            "range": "± 2011.855",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=15627.977ms max=18555.601ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1335.886,
            "range": "± 67.925",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1202.717ms max=1335.886ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.007,
            "range": "± 0.012",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=1.094ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.061,
            "range": "± 0.013",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.029ms max=0.323ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 0.312,
            "range": "± 0.118",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.144ms max=1.737ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=10000] p99",
            "value": 4037.018,
            "range": "± 1214.477",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3175.088ms max=4037.018ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=10000] p99",
            "value": 3848.274,
            "range": "± 1164.635",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3149.922ms max=3848.274ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=50,messages=10000] p99",
            "value": 3670.016,
            "range": "± 1097.441",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3112.174ms max=3670.016ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 24863.834,
            "range": "± 7252.424",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=13765.706ms max=25081.938ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 25115.492,
            "range": "± 7300.381",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=13639.877ms max=25333.596ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 6312.428,
            "range": "± 1821.444",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3745.513ms max=6358.565ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 6387.925,
            "range": "± 1855.536",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3749.708ms max=6429.868ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 4961.862,
            "range": "± 1438.509",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3374.318ms max=4982.833ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 4995.416,
            "range": "± 1451.59",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3391.095ms max=5016.388ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 250.479,
            "range": "± 38.351",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.044ms max=350.487ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 0.081,
            "range": "± 0.176",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=9.028ms"
          },
          {
            "name": "queue/MemoryQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 2000.683,
            "range": "± 399.822",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=2000.683ms max=2000.683ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.018,
            "range": "± 0.017",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.006ms max=1.659ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.006,
            "range": "± 0.002",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.04ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.029,
            "range": "± 0.019",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.011ms max=1.444ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.044,
            "range": "± 0.017",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.015ms max=1.465ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.053,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.015ms max=1.622ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.054,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.018ms max=1.583ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.066,
            "range": "± 0.026",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.036ms max=1.944ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 2.08,
            "range": "± 0.144",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=1.362ms max=2.658ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 4.1,
            "range": "± 0.149",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=3.539ms max=5.718ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 1.399,
            "range": "± 0.084",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=0.786ms max=1.488ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 84.279,
            "range": "± 3.605",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=77.66ms max=142.737ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.049,
            "range": "± 0.035",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.03ms max=2.564ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.003,
            "range": "± 0.005",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.445ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.079,
            "range": "± 0.021",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.052ms max=0.697ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.041,
            "range": "± 0.005",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.023ms max=0.124ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.153,
            "range": "± 0.035",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.098ms max=1.12ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.321,
            "range": "± 0.059",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.193ms max=1.667ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.327,
            "range": "± 0.086",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.188ms max=2.013ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.355,
            "range": "± 0.063",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.21ms max=1.932ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.456,
            "range": "± 0.095",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.353ms max=2.419ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 17.859,
            "range": "± 0.799",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=15.458ms max=17.859ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 45.613,
            "range": "± 1.187",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=38.765ms max=45.613ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 18.334,
            "range": "± 1.842",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=8.208ms max=18.334ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 1028.129,
            "range": "± 11.296",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=981.467ms max=1028.129ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.438,
            "range": "± 0.12",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.303ms max=3.408ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.034,
            "range": "± 0.014",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=0.401ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.528,
            "range": "± 0.05",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.325ms max=1.346ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.38,
            "range": "± 0.026",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.247ms max=0.459ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.189,
            "range": "± 0.035",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.109ms max=0.582ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.801,
            "range": "± 0.119",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.483ms max=1.985ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.141,
            "range": "± 0.126",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.914ms max=2.378ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.218,
            "range": "± 0.155",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.884ms max=2.337ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.919,
            "range": "± 0.188",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.055ms max=2.402ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 3.052,
            "range": "± 0.27",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.879ms max=3.445ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 75.301,
            "range": "± 0.829",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=74.318ms max=75.301ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 238.289,
            "range": "± 11.304",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=200.933ms max=238.289ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 46.891,
            "range": "± 2.162",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=43.418ms max=46.891ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 6169.821,
            "range": "± 25.869",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=6106.907ms max=6169.821ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 2.535,
            "range": "± 0.273",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.534ms max=4.669ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.122,
            "range": "± 0.031",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.06ms max=0.475ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 2.281,
            "range": "± 0.102",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.623ms max=2.552ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 241.304,
            "range": "± 8.866",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=219.283ms max=241.304ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 240.779,
            "range": "± 8.861",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=219.677ms max=240.779ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 199.098,
            "range": "± 2.001",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=194.642ms max=199.098ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=small] p99",
            "value": 121.831,
            "range": "± 2.281",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=116.523ms max=121.831ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.023,
            "range": "± 0.028",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.013ms max=2.529ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.005,
            "range": "± 0.002",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.036ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.031,
            "range": "± 0.025",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.019ms max=1.37ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.062,
            "range": "± 0.058",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.015ms max=3.426ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.087,
            "range": "± 0.111",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.015ms max=8.782ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.065,
            "range": "± 0.059",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.019ms max=3.557ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.11,
            "range": "± 0.106",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.058ms max=3.836ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 3.41,
            "range": "± 0.21",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=2.685ms max=4.362ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 8.839,
            "range": "± 0.528",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=7.606ms max=12.878ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 2.324,
            "range": "± 0.173",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=1.509ms max=2.777ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 193.462,
            "range": "± 4.701",
            "unit": "ms",
            "extra": "ops=343 errors=0 p50=173.933ms max=205.521ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.075,
            "range": "± 0.108",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.045ms max=4.895ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.003,
            "range": "± 0.052",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.001ms max=5.14ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.14,
            "range": "± 0.048",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.1ms max=1.22ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.042,
            "range": "± 0.025",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.022ms max=0.802ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.237,
            "range": "± 0.079",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.144ms max=1.611ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.371,
            "range": "± 0.15",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.764ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.413,
            "range": "± 0.186",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.226ms max=3.51ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.42,
            "range": "± 0.179",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.257ms max=3.437ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 1.305,
            "range": "± 0.455",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.563ms max=7.823ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 69.337,
            "range": "± 5.96",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=28.819ms max=69.337ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 114.819,
            "range": "± 7.988",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=77.595ms max=114.819ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 40.927,
            "range": "± 3.828",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=13.984ms max=40.927ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 2300.576,
            "range": "± 22.145",
            "unit": "ms",
            "extra": "ops=270 errors=0 p50=2239.758ms max=2300.576ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.653,
            "range": "± 0.429",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.452ms max=7.111ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.034,
            "range": "± 0.013",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=0.379ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.789,
            "range": "± 0.114",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.53ms max=2.37ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.89,
            "range": "± 0.145",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.468ms max=1.816ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.175,
            "range": "± 0.084",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.113ms max=1.305ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 2.38,
            "range": "± 0.237",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.707ms max=2.832ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 3.973,
            "range": "± 1.034",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.11ms max=15.024ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 1.372,
            "range": "± 0.34",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.074ms max=4.461ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 4.506,
            "range": "± 0.421",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.276ms max=4.653ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 7.844,
            "range": "± 1.031",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3.021ms max=9.183ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 183.108,
            "range": "± 10.935",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=149.029ms max=183.108ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 432.013,
            "range": "± 11.246",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=396.624ms max=432.013ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 83.624,
            "range": "± 2.117",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=77.332ms max=83.624ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 14805.893,
            "range": "± 83.953",
            "unit": "ms",
            "extra": "ops=250 errors=0 p50=14629.732ms max=14805.893ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 8.024,
            "range": "± 1.021",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.255ms max=9.773ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.145,
            "range": "± 0.028",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.058ms max=0.353ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 4.178,
            "range": "± 0.285",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.644ms max=4.534ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 466.616,
            "range": "± 36.225",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=380.109ms max=466.616ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 432.8,
            "range": "± 27.203",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=379.585ms max=432.8ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 418.12,
            "range": "± 4.356",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=416.547ms max=418.12ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=large] p99",
            "value": 301.728,
            "range": "± 12.446",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=280.756ms max=301.728ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.016,
            "range": "± 0.041",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.005ms max=3.445ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.075,
            "range": "± 0.01",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.03ms max=0.111ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=50,subscribers=0] p99",
            "value": 0.272,
            "range": "± 0.066",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.148ms max=0.998ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.188,
            "range": "± 0.037",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.083ms max=0.564ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] p99",
            "value": 0.056,
            "range": "± 0.046",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.021ms max=3.238ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] p99",
            "value": 32.211,
            "range": "± 1.243",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=29.95ms max=32.326ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=10000,subscribers=1] p99",
            "value": 37.585,
            "range": "± 4.736",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=28.525ms max=38.044ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=2000,subscribers=5] p99",
            "value": 27.951,
            "range": "± 5.986",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=18.842ms max=28ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=500,subscribers=20] p99",
            "value": 29.786,
            "range": "± 6.985",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=19.661ms max=29.983ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.26,
            "range": "± 0.06",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.143ms max=0.588ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.758,
            "range": "± 0.189",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.418ms max=0.973ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] p99",
            "value": 31.523,
            "range": "± 8.227",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=15.254ms max=39.879ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.056,
            "range": "± 0.036",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.027ms max=3.576ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.347,
            "range": "± 0.053",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.254ms max=1.726ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 1.518,
            "range": "± 0.103",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.252ms max=2.066ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 2.75,
            "range": "± 0.39",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.633ms max=3.547ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 4.022,
            "range": "± 0.582",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.316ms max=10.715ms"
          },
          {
            "name": "queue/FileQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1051.722,
            "range": "± 14.89",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1025.507ms max=1051.722ms"
          }
        ]
      }
    ]
  }
}