window.BENCHMARK_DATA = {
  "lastUpdate": 1795330347696,
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
      },
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
          "id": "a73c597003c03f83d8c36c5a177b1817cb1378d6",
          "message": "chore: update TypeScript to 7.1.0-dev.20261121.1 (#1093)\n\n* fix(content-mapper): treat a deferred conditional type as unconstrained\n\nA setter declared on a generic base (`set _user(value: … | PrimaryKeyType<T>)`\non `AbstractOwnerModel<T>`) is read off its declaration, so `T` is never\nsubstituted and `PK<T, …>` stays a deferred conditional. The converter fell\nthrough to its apparent type, which TypeScript 7.1.0-dev.20261121.1 now\nreports as the constraint of both branches, leaking a\n`Pick<T, T[unique symbol][number]>` definition into webda.module.json.\n\nThe checker only defers a conditional that depends on an unresolved type\nparameter, so handle it like the bare type parameter: it constrains nothing.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n\n* chore: update TypeScript to 7.1.0-dev.20261121.1\n\nNo 7.1 release candidate is published yet; move every pin from the\n2026-11-02 nightly to the latest one and regenerate the module files.\n\nThe only module change is the `_user` primary-key slot of owner models,\nfrom an empty object to the unconstrained schema produced by the previous\ncommit.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
          "timestamp": "2026-11-22T02:24:59Z",
          "url": "https://github.com/loopingz/webda.io/commit/a73c597003c03f83d8c36c5a177b1817cb1378d6"
        },
        "date": 1795330343850,
        "tool": "customBiggerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 229974.93,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.991ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 218283.42,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.039ms max=1.341ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=50,subscribers=0] throughput",
            "value": 227972.19,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.175ms max=1.44ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.501ms max=1.77ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] throughput",
            "value": 999.93,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.207ms max=4.098ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] throughput",
            "value": 55530.88,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=102.367ms max=142.213ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=10000,subscribers=1] throughput",
            "value": 56954.09,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=104.53ms max=139.985ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=2000,subscribers=5] throughput",
            "value": 84919.92,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=64.291ms max=111.542ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=500,subscribers=20] throughput",
            "value": 93314.92,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=74.908ms max=105.644ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 6771.58,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.119ms max=0.588ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 4357.13,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.182ms max=4.895ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] throughput",
            "value": 571.68,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.325ms max=8.11ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 150418.92,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.005ms max=1.791ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 183432.39,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.037ms max=1.811ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 180966,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.183ms max=1.613ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 416.14,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12138.316ms max=24041.751ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 410.35,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12163.482ms max=24377.295ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 1989.6,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2589.983ms max=5028.97ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 2049.26,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2514.485ms max=4882.17ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 3787.34,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1366.295ms max=2642.412ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 3875.81,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1352.663ms max=2581.594ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 99.81,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=20.955ms max=41.845ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 997.25,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=21.791ms max=103.219ms"
          },
          {
            "name": "queue/AMQPQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 4.43,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1002.439ms max=1040.712ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 396.29,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.361ms max=306.708ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 806.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=11.313ms max=315.621ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 888.13,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=50.823ms max=389.808ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=10000] throughput",
            "value": 366.18,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=19646.12ms max=27330.085ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=10000] throughput",
            "value": 745.87,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12599.689ms max=13522.436ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=50,messages=10000] throughput",
            "value": 776.06,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12448.694ms max=13606.322ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 124.07,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=43486.544ms max=80664.855ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 127.9,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=44392.514ms max=78248.935ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 407.57,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=17918.067ms max=24561.844ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 104.7,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=30450.647ms max=95563.022ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 184.8,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=36775.657ms max=54190.408ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 96.41,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=50.921ms max=382.992ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 128.98,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=40533.754ms max=67545.072ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 2.24,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1589.641ms max=1787.822ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 334246.94,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.002ms max=1.056ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 341064.12,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.023ms max=3.176ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 382555.47,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.116ms max=0.443ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=10000] throughput",
            "value": 2271.07,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3332.375ms max=4404.019ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=10000] throughput",
            "value": 2281.61,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3319.792ms max=4383.048ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=50,messages=10000] throughput",
            "value": 2294.54,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3326.083ms max=4362.076ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 379.52,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=14076.084ms max=26357.006ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 390.56,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=13841.203ms max=25618.809ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 1552.95,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3877.634ms max=6442.451ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 1539.78,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3938.451ms max=6496.977ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] throughput",
            "value": 1810.02,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3584.033ms max=5528.093ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] throughput",
            "value": 1891.51,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=3577.741ms max=5289.017ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.058ms max=80.151ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 1000,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.014ms max=9.036ms"
          },
          {
            "name": "queue/MemoryQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 4.99,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1000.866ms max=1001.914ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 192834.28,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.004ms max=2.664ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 476871.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.14ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 86099.27,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.01ms max=0.818ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 51990.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.013ms max=1.783ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 53207.62,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.013ms max=1.675ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 48423.1,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.016ms max=1.694ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 31516.11,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.031ms max=1.735ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 867.03,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=1.123ms max=1.977ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 344.18,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=2.865ms max=4.6ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 1523.66,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=0.636ms max=1.257ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 16.88,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=59.081ms max=71.107ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 35618.37,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.027ms max=1.392ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=small] throughput",
            "value": 731154.49,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.822ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 241551.73,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.04ms max=0.099ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 517170.05,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.018ms max=0.085ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 115648.38,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.081ms max=1.182ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 59116.33,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.164ms max=1.508ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 60093.99,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.163ms max=1.726ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 52551.37,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.186ms max=1.77ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 31297.83,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.314ms max=2.101ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 858.04,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=11.428ms max=13.132ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 340.17,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=28.967ms max=33.653ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 1549.85,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=6.222ms max=9.044ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 13.13,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=760.218ms max=786.956ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 36362.84,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.266ms max=3.006ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 761498.63,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.009ms max=2.216ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=small] throughput",
            "value": 33604.3,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.287ms max=1.753ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 232823.45,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.205ms max=0.815ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 499675.21,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.096ms max=0.17ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 121587.94,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.404ms max=1.407ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 61431.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.798ms max=2.394ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 63079.15,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.78ms max=2.39ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 53308.31,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.886ms max=3.686ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 31600.07,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.664ms max=3.963ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 816.74,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=58.196ms max=87.163ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 322.97,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=154.403ms max=158.597ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 1519.81,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=30.851ms max=39.748ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 10.58,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=4722.786ms max=4743.758ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 35866.72,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.349ms max=3.432ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 942240.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.049ms max=0.35ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=small] throughput",
            "value": 35867.23,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.381ms max=2.302ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 5.03,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=195.297ms max=206.701ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 5.13,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=192.807ms max=203.162ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=small,pageSize=100] throughput",
            "value": 6.4,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=155.058ms max=161.874ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=small] throughput",
            "value": 11.08,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=88.998ms max=95.551ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 86207.64,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.01ms max=3.418ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 529408.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.043ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 67350.95,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.016ms max=0.964ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 41778.77,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=3.099ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 43227.91,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=3.015ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 38635.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.016ms max=2.869ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 20918.45,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.042ms max=3.576ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 469.95,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=2.091ms max=2.935ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 176.18,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=5.587ms max=8.348ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 773.67,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=1.208ms max=2.732ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 7.08,
            "unit": "ops/s",
            "extra": "ops=425 errors=0 p50=140.378ms max=163.054ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 24011.56,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.037ms max=7.164ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=large] throughput",
            "value": 838644.75,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.231ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 115592.24,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.084ms max=0.822ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 454421.52,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.02ms max=0.112ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 77985.48,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.123ms max=1.22ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 49169.53,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.191ms max=3.033ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 50101.96,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.187ms max=3.133ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 45774.55,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.21ms max=3.009ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 20797.8,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.446ms max=4.579ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 470.44,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=21.332ms max=24.838ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 169.55,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=58.327ms max=84.607ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 908.57,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=10.306ms max=20.103ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 6.3,
            "unit": "ops/s",
            "extra": "ops=380 errors=0 p50=1586.495ms max=1657.799ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 24428.91,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.357ms max=12.96ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 956571.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.009ms max=0.227ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=large] throughput",
            "value": 25065.55,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.394ms max=0.907ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 124342.54,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.395ms max=0.888ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 492174.43,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.097ms max=0.495ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 79950.11,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.603ms max=1.699ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 51598.52,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.935ms max=3.156ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 54671.4,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.89ms max=3.062ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 48259.05,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.997ms max=3.119ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 21530.56,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.322ms max=6.021ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 455.59,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=110.559ms max=112.132ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 172.1,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=288.358ms max=303.301ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 843.39,
            "unit": "ops/s",
            "extra": "ops=500 errors=0 p50=59.507ms max=61.342ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 4.83,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=10225.713ms max=10687.087ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 25179.85,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=1.809ms max=7.705ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 918273.65,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.051ms max=0.335ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=large] throughput",
            "value": 24302.52,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=2.03ms max=3.5ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 2.92,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=333.709ms max=362.807ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 3.03,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=326.107ms max=352.322ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=large,pageSize=100] throughput",
            "value": 3.03,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=333.447ms max=343.933ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=large] throughput",
            "value": 4.28,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=230.162ms max=248.119ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 243066.53,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.004ms max=1.718ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 289838.27,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.029ms max=2.404ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=50,subscribers=0] throughput",
            "value": 397851.6,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.118ms max=0.241ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.096ms max=0.686ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] throughput",
            "value": 1000,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.016ms max=1.007ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] throughput",
            "value": 214343.89,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=24.134ms max=26.411ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=10000,subscribers=1] throughput",
            "value": 225474.06,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=20.775ms max=25.706ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=2000,subscribers=5] throughput",
            "value": 383877.16,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=14.459ms max=20.513ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=500,subscribers=20] throughput",
            "value": 388545.67,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=12.755ms max=21.168ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 15316.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.084ms max=0.6ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 4589.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.283ms max=0.878ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] throughput",
            "value": 84.41,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=13.926ms max=28.869ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 70838.09,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.012ms max=2.064ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 80068.54,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.118ms max=1.859ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=50,payloadBytes=100] throughput",
            "value": 84122.68,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.588ms max=1.341ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.09,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.859ms max=1.66ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] throughput",
            "value": 999.94,
            "unit": "ops/s",
            "extra": "ops=10000 errors=0 p50=0.679ms max=4.313ms"
          },
          {
            "name": "queue/FileQueue/queue.redelivery[failureRate=0.05,messages=100] throughput",
            "value": 0.5,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1013.973ms max=1030.75ms"
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
      },
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
          "id": "a73c597003c03f83d8c36c5a177b1817cb1378d6",
          "message": "chore: update TypeScript to 7.1.0-dev.20261121.1 (#1093)\n\n* fix(content-mapper): treat a deferred conditional type as unconstrained\n\nA setter declared on a generic base (`set _user(value: … | PrimaryKeyType<T>)`\non `AbstractOwnerModel<T>`) is read off its declaration, so `T` is never\nsubstituted and `PK<T, …>` stays a deferred conditional. The converter fell\nthrough to its apparent type, which TypeScript 7.1.0-dev.20261121.1 now\nreports as the constraint of both branches, leaking a\n`Pick<T, T[unique symbol][number]>` definition into webda.module.json.\n\nThe checker only defers a conditional that depends on an unresolved type\nparameter, so handle it like the bare type parameter: it constrains nothing.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n\n* chore: update TypeScript to 7.1.0-dev.20261121.1\n\nNo 7.1 release candidate is published yet; move every pin from the\n2026-11-02 nightly to the latest one and regenerate the module files.\n\nThe only module change is the `_user` primary-key slot of owner models,\nfrom an empty object to the unconstrained schema produced by the previous\ncommit.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
          "timestamp": "2026-11-22T02:24:59Z",
          "url": "https://github.com/loopingz/webda.io/commit/a73c597003c03f83d8c36c5a177b1817cb1378d6"
        },
        "date": 1795330347005,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.01,
            "range": "± 0.01",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.991ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.101,
            "range": "± 0.044",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.039ms max=1.341ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=50,subscribers=0] p99",
            "value": 0.465,
            "range": "± 0.121",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.175ms max=1.44ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.915,
            "range": "± 0.133",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.501ms max=1.77ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] p99",
            "value": 0.41,
            "range": "± 0.147",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.207ms max=4.098ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] p99",
            "value": 141.689,
            "range": "± 26.997",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=102.367ms max=142.213ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=10000,subscribers=1] p99",
            "value": 139.198,
            "range": "± 30.012",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=104.53ms max=139.985ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=2000,subscribers=5] p99",
            "value": 111.477,
            "range": "± 30.979",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=64.291ms max=111.542ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=500,subscribers=20] p99",
            "value": 105.578,
            "range": "± 30.887",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=74.908ms max=105.644ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.289,
            "range": "± 0.058",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.119ms max=0.588ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 1.471,
            "range": "± 0.263",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.182ms max=4.895ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] p99",
            "value": 6.324,
            "range": "± 1.016",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.325ms max=8.11ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.022,
            "range": "± 0.019",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.005ms max=1.791ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.137,
            "range": "± 0.061",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.037ms max=1.811ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 0.668,
            "range": "± 0.164",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.183ms max=1.613ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 23806.87,
            "range": "± 6897.465",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12138.316ms max=24041.751ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 24125.637,
            "range": "± 7016.022",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12163.482ms max=24377.295ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 4978.639,
            "range": "± 1411.494",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2589.983ms max=5028.97ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 4836.033,
            "range": "± 1368.209",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2514.485ms max=4882.17ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 2615.149,
            "range": "± 728.426",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1366.295ms max=2642.412ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 2556.428,
            "range": "± 709.41",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1352.663ms max=2581.594ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 40.927,
            "range": "± 11.842",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=20.955ms max=41.845ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 69.206,
            "range": "± 14.542",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=21.791ms max=103.219ms"
          },
          {
            "name": "queue/AMQPQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1040.712,
            "range": "± 19.057",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1002.439ms max=1040.712ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 5.284,
            "range": "± 3.134",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.361ms max=306.708ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 22.086,
            "range": "± 9.986",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=11.313ms max=315.621ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 360.448,
            "range": "± 38.547",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=50.823ms max=389.808ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=10000] p99",
            "value": 27179.09,
            "range": "± 4552.229",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=19646.12ms max=27330.085ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=10000] p99",
            "value": 13446.939,
            "range": "± 547.576",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12599.689ms max=13522.436ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=50,messages=10000] p99",
            "value": 13153.337,
            "range": "± 379.799",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12448.694ms max=13606.322ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 79859.548,
            "range": "± 19648.153",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=43486.544ms max=80664.855ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 77577.847,
            "range": "± 19116.32",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=44392.514ms max=78248.935ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 24427.626,
            "range": "± 3699.307",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=17918.067ms max=24561.844ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 93683.974,
            "range": "± 22300.34",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=30450.647ms max=95563.022ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 53854.863,
            "range": "± 10150.252",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=36775.657ms max=54190.408ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 107.217,
            "range": "± 24.071",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=50.921ms max=382.992ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 67041.755,
            "range": "± 14839.569",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=40533.754ms max=67545.072ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1787.822,
            "range": "± 289.934",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1589.641ms max=1787.822ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.006,
            "range": "± 0.011",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.002ms max=1.056ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.053,
            "range": "± 0.1",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.023ms max=3.176ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 0.262,
            "range": "± 0.039",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.116ms max=0.443ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=10000] p99",
            "value": 4404.019,
            "range": "± 1332.255",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3332.375ms max=4404.019ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=10000] p99",
            "value": 4383.048,
            "range": "± 1331.989",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3319.792ms max=4383.048ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=50,messages=10000] p99",
            "value": 4362.076,
            "range": "± 1313.908",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3326.083ms max=4362.076ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 26122.125,
            "range": "± 7629.959",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=14076.084ms max=26357.006ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 25400.705,
            "range": "± 7411.066",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=13841.203ms max=25618.809ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 6396.314,
            "range": "± 1858.782",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3877.634ms max=6442.451ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=5,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 6455.034,
            "range": "± 1880.661",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3938.451ms max=6496.977ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=true] p99",
            "value": 5507.121,
            "range": "± 1649.366",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3584.033ms max=5528.093ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=10000,workMs=2,workerParallelism=false] p99",
            "value": 5263.852,
            "range": "± 1543.014",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=3577.741ms max=5289.017ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 0.332,
            "range": "± 4.508",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.058ms max=80.151ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 0.092,
            "range": "± 0.175",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.014ms max=9.036ms"
          },
          {
            "name": "queue/MemoryQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1001.914,
            "range": "± 0.419",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1000.866ms max=1001.914ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.015,
            "range": "± 0.027",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.004ms max=2.664ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.005,
            "range": "± 0.002",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.14ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.027,
            "range": "± 0.01",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.01ms max=0.818ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.041,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.013ms max=1.783ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.042,
            "range": "± 0.025",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.013ms max=1.675ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.043,
            "range": "± 0.019",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.016ms max=1.694ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.05,
            "range": "± 0.029",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.031ms max=1.735ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 1.706,
            "range": "± 0.116",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=1.123ms max=1.977ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 3.469,
            "range": "± 0.156",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=2.865ms max=4.6ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 1.123,
            "range": "± 0.088",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=0.636ms max=1.257ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 64.586,
            "range": "± 1.129",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=59.081ms max=71.107ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.041,
            "range": "± 0.021",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.027ms max=1.392ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=small] p99",
            "value": 0.002,
            "range": "± 0.009",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.822ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.061,
            "range": "± 0.005",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.04ms max=0.099ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.035,
            "range": "± 0.004",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.018ms max=0.085ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.145,
            "range": "± 0.039",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.081ms max=1.182ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.232,
            "range": "± 0.051",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.164ms max=1.508ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.244,
            "range": "± 0.056",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.163ms max=1.726ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.254,
            "range": "± 0.071",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.186ms max=1.77ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.4,
            "range": "± 0.095",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.314ms max=2.101ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 13.132,
            "range": "± 0.522",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=11.428ms max=13.132ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 33.653,
            "range": "± 0.888",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=28.967ms max=33.653ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 9.044,
            "range": "± 0.666",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=6.222ms max=9.044ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 786.956,
            "range": "± 7.253",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=760.218ms max=786.956ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.404,
            "range": "± 0.104",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.266ms max=3.006ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.033,
            "range": "± 0.07",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.009ms max=2.216ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=small] p99",
            "value": 0.452,
            "range": "± 0.063",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.287ms max=1.753ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.339,
            "range": "± 0.048",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.205ms max=0.815ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.158,
            "range": "± 0.011",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.096ms max=0.17ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.535,
            "range": "± 0.073",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.404ms max=1.407ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.225,
            "range": "± 0.162",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.798ms max=2.394ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.043,
            "range": "± 0.132",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.78ms max=2.39ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.637,
            "range": "± 0.263",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.886ms max=3.686ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 2.652,
            "range": "± 0.27",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.664ms max=3.963ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 87.163,
            "range": "± 8.742",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=58.196ms max=87.163ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 158.597,
            "range": "± 1.913",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=154.403ms max=158.597ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 39.748,
            "range": "± 2.761",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=30.851ms max=39.748ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 4743.758,
            "range": "± 11.602",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=4722.786ms max=4743.758ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 2.132,
            "range": "± 0.213",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.349ms max=3.432ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 0.102,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.049ms max=0.35ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=small] p99",
            "value": 1.58,
            "range": "± 0.084",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.381ms max=2.302ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 206.701,
            "range": "± 5.983",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=195.297ms max=206.701ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 203.162,
            "range": "± 4.702",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=192.807ms max=203.162ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=small,pageSize=100] p99",
            "value": 161.874,
            "range": "± 2.997",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=155.058ms max=161.874ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=small] p99",
            "value": 95.551,
            "range": "± 2.637",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=88.998ms max=95.551ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.026,
            "range": "± 0.038",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.01ms max=3.418ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.004,
            "range": "± 0.002",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.003ms max=0.043ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.034,
            "range": "± 0.018",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.016ms max=0.964ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.054,
            "range": "± 0.056",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=3.099ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.054,
            "range": "± 0.053",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=3.015ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.057,
            "range": "± 0.058",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.016ms max=2.869ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.067,
            "range": "± 0.102",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.042ms max=3.576ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 2.576,
            "range": "± 0.123",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=2.091ms max=2.935ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 6.238,
            "range": "± 0.227",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=5.587ms max=8.348ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 2.497,
            "range": "± 0.246",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=1.208ms max=2.732ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 159.252,
            "range": "± 3.906",
            "unit": "ms",
            "extra": "ops=425 errors=0 p50=140.378ms max=163.054ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.054,
            "range": "± 0.139",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.037ms max=7.164ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=10000,docSize=large] p99",
            "value": 0.002,
            "range": "± 0.003",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.001ms max=0.231ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.122,
            "range": "± 0.034",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.084ms max=0.822ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.045,
            "range": "± 0.006",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.02ms max=0.112ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.19,
            "range": "± 0.063",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.123ms max=1.22ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.315,
            "range": "± 0.136",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.191ms max=3.033ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.327,
            "range": "± 0.135",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.187ms max=3.133ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.335,
            "range": "± 0.127",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.21ms max=3.009ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.697,
            "range": "± 0.346",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.446ms max=4.579ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 24.838,
            "range": "± 0.866",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=21.332ms max=24.838ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 84.607,
            "range": "± 3.871",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=58.327ms max=84.607ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 20.103,
            "range": "± 1.518",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=10.306ms max=20.103ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 1657.799,
            "range": "± 28.497",
            "unit": "ms",
            "extra": "ops=380 errors=0 p50=1586.495ms max=1657.799ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.943,
            "range": "± 0.579",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.357ms max=12.96ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.03,
            "range": "± 0.008",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.009ms max=0.227ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=10000,docSize=large] p99",
            "value": 0.601,
            "range": "± 0.039",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.394ms max=0.907ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.567,
            "range": "± 0.059",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.395ms max=0.888ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.129,
            "range": "± 0.028",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.097ms max=0.495ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 1.487,
            "range": "± 0.139",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.603ms max=1.699ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 1.961,
            "range": "± 0.236",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.935ms max=3.156ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 1.114,
            "range": "± 0.217",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.89ms max=3.062ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 2.812,
            "range": "± 0.26",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.997ms max=3.119ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 5.603,
            "range": "± 0.682",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.322ms max=6.021ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 112.132,
            "range": "± 2.389",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=110.559ms max=112.132ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 303.301,
            "range": "± 6.085",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=288.358ms max=303.301ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 61.342,
            "range": "± 1.39",
            "unit": "ms",
            "extra": "ops=500 errors=0 p50=59.507ms max=61.342ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 10687.087,
            "range": "± 173.455",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=10225.713ms max=10687.087ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 7.07,
            "range": "± 0.902",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=1.809ms max=7.705ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 0.12,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.051ms max=0.335ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=50,dataset=10000,docSize=large] p99",
            "value": 3.058,
            "range": "± 0.204",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=2.03ms max=3.5ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 362.807,
            "range": "± 14.731",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=333.709ms max=362.807ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 352.322,
            "range": "± 11.264",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=326.107ms max=352.322ms"
          },
          {
            "name": "store/MemoryStore/store.updateMany[dataset=10000,docSize=large,pageSize=100] p99",
            "value": 343.933,
            "range": "± 11.301",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=333.447ms max=343.933ms"
          },
          {
            "name": "store/MemoryStore/store.deleteMany[bulkSize=100,docSize=large] p99",
            "value": 248.119,
            "range": "± 7.272",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=230.162ms max=248.119ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.011,
            "range": "± 0.017",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.004ms max=1.718ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.083,
            "range": "± 0.076",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.029ms max=2.404ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=50,subscribers=0] p99",
            "value": 0.214,
            "range": "± 0.023",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.118ms max=0.241ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.165,
            "range": "± 0.03",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.096ms max=0.686ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=1000,subscribers=1] p99",
            "value": 0.052,
            "range": "± 0.015",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.016ms max=1.007ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=10000,publishConcurrency=10,subscribers=1] p99",
            "value": 26.182,
            "range": "± 0.919",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=24.134ms max=26.411ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=10000,subscribers=1] p99",
            "value": 25.395,
            "range": "± 2.108",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=20.775ms max=25.706ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=2000,subscribers=5] p99",
            "value": 20.382,
            "range": "± 4.364",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=14.459ms max=20.513ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=500,subscribers=20] p99",
            "value": 20.84,
            "range": "± 4.812",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=12.755ms max=21.168ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.169,
            "range": "± 0.044",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.084ms max=0.6ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.621,
            "range": "± 0.157",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.283ms max=0.878ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=262144,subscribers=1] p99",
            "value": 24.347,
            "range": "± 6.749",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=13.926ms max=28.869ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.031,
            "range": "± 0.022",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.012ms max=2.064ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.182,
            "range": "± 0.057",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.118ms max=1.859ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=50,payloadBytes=100] p99",
            "value": 0.794,
            "range": "± 0.071",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.588ms max=1.341ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 1.268,
            "range": "± 0.098",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.859ms max=1.66ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=1000] p99",
            "value": 1.637,
            "range": "± 0.172",
            "unit": "ms",
            "extra": "ops=10000 errors=0 p50=0.679ms max=4.313ms"
          },
          {
            "name": "queue/FileQueue/queue.redelivery[failureRate=0.05,messages=100] p99",
            "value": 1030.75,
            "range": "± 8.606",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1013.973ms max=1030.75ms"
          }
        ]
      }
    ]
  }
}