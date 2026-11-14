window.BENCHMARK_DATA = {
  "lastUpdate": 1794627730153,
  "repoUrl": "https://github.com/loopingz/webda.io",
  "entries": {
    "Throughput (quick)": [
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
          "id": "d992918039c3f7006c8c522ea250d70027a10f99",
          "message": "fix: sqlite on Node 22, stable gcp module file, deterministic downloadTo test (#1070)\n\n* fix(sqlite): bind numbered parameters on Node 22\n\nnode:sqlite on Node 22 does not bind positional values to numbered\nparameters (?1, ?2): every statement with a value failed with 'column index\nout of range'. The binding is probed once, and values are passed by name\nwhere positional binding is not available. Later Node versions keep binding\nby position.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n* test(core): make the downloadTo write error test deterministic\n\nThe stubbed service returned no stream, so pipe() threw before the write\nstream reported its error: the handler ran after the test or not at all, and\nline coverage of binary.service.ts moved between 100% and 99.96%.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n* fix(content-mapper): leave ES private fields out of the schemas\n\nA #private field of a class reached the schema under the name the compiler\ngives it (__#<n>@#private), with a counter that depends on the order the\nclasses were checked in: the gcp module file changed on every build.\n\nThe gcp module file is regenerated: the private names are gone, and it picks\nup the signal option of google-gax 6.16 that the committed file was missing.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Fable 5.2 <noreply@anthropic.com>",
          "timestamp": "2026-11-13T00:01:34Z",
          "url": "https://github.com/loopingz/webda.io/commit/d992918039c3f7006c8c522ea250d70027a10f99"
        },
        "date": 1794541399599,
        "tool": "customBiggerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 100948.92,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.972ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 117813.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.077ms max=0.596ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.31,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.451ms max=2.13ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 26461.33,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=22.97ms max=30.13ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 17771.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.086ms max=50.201ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 17367.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=52.462ms max=56.492ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 2620.68,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.373ms max=0.487ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 1956.3,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.486ms max=0.861ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 46012.98,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.017ms max=0.596ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 85382.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.103ms max=0.269ms"
          },
          {
            "name": "queue/AMQPQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 48.65,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=10292.822ms max=20568.867ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 399.5,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1287.651ms max=2503.999ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 399.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1292.894ms max=2501.902ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 2886.44,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=200.671ms max=346.554ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 2948.45,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=200.933ms max=339.214ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.09,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=20.333ms max=41.222ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 522.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.836ms max=4.944ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 708.87,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=13.099ms max=26.329ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 501.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1724.908ms max=2023.752ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 606.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1591.738ms max=1943.011ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 165.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3730.833ms max=6043.992ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 166.83,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3869.245ms max=6018.826ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 540.18,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1648.361ms max=1876.951ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 237.92,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2881.487ms max=4221.567ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.24,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=2.804ms max=5.906ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 255.01,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.598ms max=11.174ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 283.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.418ms max=6.603ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 196.65,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.919ms max=19.038ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 187.5,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.124ms max=11.952ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 198.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.833ms max=17.727ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 204.13,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.719ms max=15.032ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 99.05,
            "unit": "ops/s",
            "extra": "ops=991 errors=0 p50=11.084ms max=21.496ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 14.02,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=70.058ms max=84.148ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 14.82,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=66.847ms max=98.959ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 16,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=61.374ms max=79.167ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 11.36,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=86.966ms max=114.491ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 192.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.046ms max=9.069ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 187.28,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.841ms max=361.234ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 331.98,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=29.409ms max=64.225ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 350.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=28.049ms max=64.815ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 313.67,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=31.441ms max=64.324ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 290.96,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=33.653ms max=74.514ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 299.32,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=33.161ms max=79.364ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 329.42,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=29.917ms max=61.768ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 134.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=72.548ms max=138.412ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 9.73,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=984.089ms max=1402.995ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 13.29,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=753.402ms max=877.658ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 18.54,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=535.036ms max=732.43ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 30.15,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=332.399ms max=425.722ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 319.94,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=31.08ms max=67.011ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 307.25,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=28.852ms max=414.188ms emulated"
          },
          {
            "name": "store/DynamoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 332.23,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=29.786ms max=65.765ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 3.57,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=285.737ms max=304.873ms emulated"
          },
          {
            "name": "store/DynamoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 3.95,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=254.935ms max=255.459ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 124362.64,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.765ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 239291.7,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.039ms max=0.086ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 29245.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=27.64ms max=34.21ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 55227.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=15.376ms max=18.121ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 447.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1130.365ms max=2237.661ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 452.44,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1119.879ms max=2210.398ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3984.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=140.64ms max=251.134ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 3893.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=141.558ms max=256.901ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.33,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.067ms max=80.151ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 63455.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.011ms max=0.45ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 221533.01,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.004ms max=0.067ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 32761.11,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.024ms max=3.994ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 30332.44,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.022ms max=0.121ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 29426.48,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.023ms max=0.154ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 26665.24,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.028ms max=0.63ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 15592.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.059ms max=0.209ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 511.43,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.844ms max=3.361ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 184.72,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=5.313ms max=8.073ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 905.15,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.042ms max=1.992ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 99.65,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=9.904ms max=11.985ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 17397.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.043ms max=0.4ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 352360.82,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.002ms max=0.532ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 153727.9,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.06ms max=0.159ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 269324,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.027ms max=0.111ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 67659,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.14ms max=0.372ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 37306.47,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.262ms max=0.409ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 36655.55,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.264ms max=0.427ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 32248.7,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.291ms max=1.08ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 18679.02,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.529ms max=1.14ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 560.81,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=17.58ms max=19.562ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 197.18,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=50.463ms max=52.527ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1087.9,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=9.11ms max=9.855ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 79.5,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=125.567ms max=128.516ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 23084.03,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.423ms max=0.84ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 720980.53,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.011ms max=0.056ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 21229.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.452ms max=0.981ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 52.2,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=19.481ms max=20.562ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 60.47,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=16.507ms max=17.433ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 84896.85,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.008ms max=0.232ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 106974.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.065ms max=2.562ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.085ms max=3.969ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 74878.32,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=6.439ms max=7.492ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 101091.79,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.583ms max=6.373ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 96079.94,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.907ms max=8.217ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 8772.7,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.095ms max=0.34ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 5214.85,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.18ms max=0.787ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 19171.04,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.047ms max=0.38ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 22385.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.44ms max=0.735ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 252.77,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2982.15ms max=3957.326ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 250.81,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3038.773ms max=3988.783ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 163.08,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4087.349ms max=6136.267ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 166.16,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3997.172ms max=6018.826ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 245.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3061.842ms max=4070.572ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 247.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3019.899ms max=4047.503ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.31,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.566ms max=2.222ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 33075.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.027ms max=0.447ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 89453.44,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.013ms max=0.046ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 5853.4,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.152ms max=1.19ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 5143.64,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.187ms max=1.398ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4738.44,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.197ms max=1.498ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4633.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.206ms max=5.681ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4973.74,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.19ms max=1.303ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 37.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=26.1ms max=30.278ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 34.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=28.885ms max=35.226ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 45.21,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=22.02ms max=23.921ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 21.97,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=44.532ms max=61.473ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 9366.98,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.101ms max=0.322ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 41414.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.022ms max=0.255ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 54056.98,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.171ms max=0.804ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 112334.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.077ms max=0.205ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 5675.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.724ms max=2.607ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 5396.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.805ms max=3.197ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4484.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.076ms max=14.705ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4597.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.12ms max=3.951ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 5031.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.897ms max=7.418ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 28.53,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=349.7ms max=354.157ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 27.91,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=356.516ms max=366.215ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 34.24,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=290.718ms max=297.271ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 16.97,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=588.775ms max=598.213ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 10631.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.916ms max=1.61ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 41516.17,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.218ms max=0.459ms"
          },
          {
            "name": "store/FileStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4161.86,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.296ms max=7.95ms"
          },
          {
            "name": "store/FileStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 1.83,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=551.551ms max=554.172ms"
          },
          {
            "name": "store/FileStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 1.85,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=541.59ms max=550.502ms"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 92.2,
            "unit": "ops/s",
            "extra": "ops=922 errors=0 p50=10.871ms max=19.005ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 835.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.821ms max=20.316ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 99.74,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=34.406ms max=57.868ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 795.33,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=36.241ms max=63.373ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 92.36,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=35.521ms max=66.486ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 452.28,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=35.619ms max=66.879ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 19.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=50.135ms max=50.889ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 19.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=50.135ms max=50.495ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 88.81,
            "unit": "ops/s",
            "extra": "ops=889 errors=0 p50=11.264ms max=21.086ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 808.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.911ms max=56.885ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 738.21,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1156.579ms max=1394.606ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 1000.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=856.162ms max=1067.975ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 1004.84,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=853.541ms max=1081.082ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 1000.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=904.921ms max=1071.645ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 49.06,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=1639.973ms max=3164.602ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 414.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.281ms max=16.122ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 492.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.985ms max=11.1ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 230.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.141ms max=16.843ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 241.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.965ms max=18.629ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 262.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.721ms max=15.524ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1006.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.911ms max=9.503ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 189.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=6.308ms max=31.621ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 64.87,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=14.033ms max=34.275ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 81.09,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=11.969ms max=17.383ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 51.74,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=18.989ms max=25.33ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 155.88,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=6.136ms max=13.033ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1207.3,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.791ms max=8.888ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 278.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.459ms max=19.12ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2162.13,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.135ms max=22.381ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2305.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.973ms max=16.564ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1133.4,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=8.356ms max=22.036ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 303.09,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=7.619ms max=3290.431ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 284.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=6.132ms max=3294.626ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1890.33,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.891ms max=20.66ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 751.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=14.451ms max=38.437ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 97.93,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=91.423ms max=221.118ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 113.75,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=84.804ms max=137.626ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 77.92,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=125.501ms max=230.949ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 277.09,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=35.258ms max=63.177ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1365.28,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=6.476ms max=22.151ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 968.86,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=9.56ms max=27.623ms emulated"
          },
          {
            "name": "store/FireStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1691.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.411ms max=24.592ms emulated"
          },
          {
            "name": "store/FireStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 1.68,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=646.447ms max=734.003ms emulated"
          },
          {
            "name": "store/FireStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 2.76,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=354.943ms max=385.352ms emulated"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2464.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.393ms max=2.216ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2349.86,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.417ms max=0.966ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2053.15,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.482ms max=0.904ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2179.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.451ms max=0.837ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2251.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.436ms max=0.665ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2871.64,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.342ms max=0.752ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1044.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.091ms max=1.544ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 539.43,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.795ms max=2.679ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 504.27,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.979ms max=2.202ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 596.95,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.636ms max=2.609ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 462.38,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=2.072ms max=3.512ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2848.32,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.339ms max=1.392ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3109.83,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.312ms max=0.95ms"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4666.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.912ms max=5.804ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4955.28,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.658ms max=6.504ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4506.84,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.79ms max=6.525ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4601.15,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.713ms max=7.352ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4817.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.69ms max=4.325ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 6070.13,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.364ms max=3.518ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1984.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.833ms max=10.912ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 635.32,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=12.263ms max=32.719ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 731.11,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=11.567ms max=26.739ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 710.74,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=11.551ms max=26.247ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 709.92,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=12.968ms max=28.361ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 5296.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.679ms max=4.084ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 6377.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.288ms max=5.169ms"
          },
          {
            "name": "store/MongoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 6362.86,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.27ms max=4.026ms"
          },
          {
            "name": "store/MongoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 20.55,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=49.086ms max=50.921ms"
          },
          {
            "name": "store/MongoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 20.69,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=47.612ms max=49.971ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 3211.21,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.296ms max=2.482ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 6663.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.433ms max=4.895ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.407ms max=1.185ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 7373.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.022ms max=2.673ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 3217.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.369ms max=2.15ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 12987.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.469ms max=1.382ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 2499,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.391ms max=0.55ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 2415.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.4ms max=2.23ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 5338.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.692ms max=11.469ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 2186.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=309.068ms max=461.373ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 7007.71,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=192.938ms max=247.857ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 2434.23,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=300.417ms max=415.236ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 382.91,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1413.48ms max=2619.343ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 2514.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=306.708ms max=402.653ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 383.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1414.529ms max=2610.954ms"
          },
          {
            "name": "queue/PostgresQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.28,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=1.157ms max=10.994ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3344.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.296ms max=0.526ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3592.95,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.276ms max=1.416ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2116.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.458ms max=3.346ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2233.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.43ms max=5.378ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2226.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.434ms max=6.869ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2240.68,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.433ms max=5.669ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1191.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.903ms max=2.707ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 747.31,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.299ms max=1.972ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 638.4,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.512ms max=2.294ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 847.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.168ms max=1.835ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 779.87,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.231ms max=2.14ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2480.63,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.383ms max=5.734ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2737.65,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.345ms max=5.96ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 9214.47,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.884ms max=3.224ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 10239.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.838ms max=2.359ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 6798.47,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.393ms max=4.44ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 7408.61,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.312ms max=2.753ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 7442.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.278ms max=3.85ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 7741.68,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.231ms max=2.621ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3474.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.771ms max=7.598ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1276.23,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=6.861ms max=14.516ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1152.02,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=8.098ms max=17.99ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1119.48,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=7.782ms max=16.908ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1456.56,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=5.96ms max=26.296ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 8160.87,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.208ms max=2.894ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 8714.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.972ms max=15.229ms"
          },
          {
            "name": "store/PostgresStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 4128.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.692ms max=13.124ms"
          },
          {
            "name": "store/PostgresStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 32.66,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=29.262ms max=33.423ms"
          },
          {
            "name": "store/PostgresStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 30.37,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=32.735ms max=33.325ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 25209.87,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.023ms max=3.426ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 27674,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.248ms max=3.897ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.33,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.13ms max=3.131ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 15400.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.22ms max=3.666ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 10685.82,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.07ms max=3.482ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 23544.92,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.141ms max=0.927ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 7806.4,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.086ms max=2.611ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 6989.1,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.125ms max=0.381ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 25042.57,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.024ms max=3.607ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 29666.55,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.237ms max=3.338ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 25229.59,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=36.536ms max=39.715ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 27836.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=35.652ms max=39.682ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3647.08,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=167.379ms max=274.465ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 466,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1097.859ms max=2146.435ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3918.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=146.276ms max=255.328ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 459.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1111.491ms max=2176.844ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.174ms max=3.58ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 29022.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.024ms max=8.684ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 89782.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.01ms max=0.094ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 19880.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.042ms max=3.406ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 22381.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.038ms max=2.927ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 23398.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.037ms max=3.107ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 27298.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.029ms max=3.371ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 10687.64,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.082ms max=3.424ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 951.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.996ms max=1.877ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 770.98,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.245ms max=2.38ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1208.84,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.794ms max=1.346ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 561.88,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.71ms max=2.947ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 19715.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.035ms max=3.557ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 31482.18,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.017ms max=3.252ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 70636.43,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.134ms max=0.214ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 101978.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.085ms max=0.217ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 25697.03,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.345ms max=3.789ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 28295.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.308ms max=3.754ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 32410.71,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.291ms max=1.155ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 33445.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.23ms max=3.891ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 13603.22,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.758ms max=5.218ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1243.78,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=7.938ms max=9.47ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 921.23,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=10.756ms max=13.648ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1373.61,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=7.18ms max=10.035ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 493.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=20.218ms max=24.347ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 20346.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.369ms max=4.526ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 37931.95,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.191ms max=3.416ms"
          },
          {
            "name": "store/SQLiteStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 38824.4,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.217ms max=3.547ms"
          },
          {
            "name": "store/SQLiteStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 33.62,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=27.574ms max=34.374ms"
          },
          {
            "name": "store/SQLiteStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 33.31,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=30.278ms max=30.441ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 1028.45,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.914ms max=5.935ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 897.24,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.035ms max=8.618ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 695.78,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.335ms max=9.544ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 64.86,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=15.188ms max=18.907ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 61.69,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=15.917ms max=36.143ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 64.13,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=15.008ms max=31.31ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1507.42,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=6.373ms max=17.285ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 1504.85,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.341ms max=15.802ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 919.06,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=10.199ms max=16.179ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 66.83,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=146.67ms max=167.117ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 64.74,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=138.674ms max=305.922ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 65.89,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=148.636ms max=311.427ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5] throughput",
            "value": 0.91,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1092.616ms max=1119.879ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 41.31,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=24.281ms max=25.117ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5] throughput",
            "value": 2.68,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=371.458ms max=379.585ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5] throughput",
            "value": 2.17,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=458.228ms max=467.403ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5] throughput",
            "value": 5.04,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=193.2ms max=230.818ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 18.34,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=54.559ms max=55.443ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 6.95,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=137.757ms max=177.603ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 23.84,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=41.878ms max=42.402ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 274.74,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=3.629ms max=3.854ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 1.04,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=975.7ms max=997.196ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 37.87,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=24.756ms max=30.36ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 3.32,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=300.417ms max=303.301ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 2.7,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=369.623ms max=378.012ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 4.48,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=243.27ms max=256.246ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 18.31,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=54.657ms max=55.083ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 5.93,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=188.875ms max=201.589ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 25.87,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=38.765ms max=39.289ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 283.35,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=3.508ms max=3.731ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 68.82,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=14.189ms max=20.529ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 52.14,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=18.874ms max=42.467ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 264.3,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.639ms max=10.633ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 220.17,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.387ms max=13.361ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 2069.77,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.319ms max=9.88ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 2815.16,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.338ms max=0.58ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 3467.41,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.269ms max=0.473ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 222.3,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.293ms max=12.886ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 59.19,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=167.379ms max=197.788ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 46.81,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=211.55ms max=233.046ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 269.21,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=36.7ms max=44.335ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 229.97,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=41.157ms max=68.616ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 5292.41,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.825ms max=2.54ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 3194.94,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.195ms max=10.551ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 3471.2,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.773ms max=9.29ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 244.69,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=40.698ms max=42.959ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 67.39,
            "unit": "ops/s",
            "extra": "ops=675 errors=0 p50=19.317ms max=36.372ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 58.06,
            "unit": "ops/s",
            "extra": "ops=585 errors=0 p50=187.564ms max=350.487ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=1] throughput",
            "value": 26.49,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=36.798ms max=47.481ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=10] throughput",
            "value": 68.04,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=120.652ms max=179.569ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 87.13,
            "unit": "ops/s",
            "extra": "ops=873 errors=0 p50=14.139ms max=29.59ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 72.65,
            "unit": "ops/s",
            "extra": "ops=734 errors=0 p50=131.465ms max=280.232ms"
          },
          {
            "name": "blog/MemoryStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 7.66,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=112.067ms max=171.835ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 226.94,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.272ms max=9.814ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 285.68,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.095ms max=9.822ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 515.37,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.797ms max=7.176ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 289.02,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.084ms max=10.813ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 916.66,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.932ms max=6.824ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1018.61,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.966ms max=2.079ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1007.6,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.864ms max=6.164ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 251.31,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.738ms max=11.731ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 367.55,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=20.873ms max=82.838ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 542.46,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=16.81ms max=48.824ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 923.08,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.429ms max=23.216ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 576.83,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=16.163ms max=52.33ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1041.18,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=7.131ms max=80.544ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1199.7,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=6.894ms max=80.937ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1129.17,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.233ms max=79.626ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 473.6,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=19.202ms max=57.082ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 266.12,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.067ms max=16.523ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 561.41,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=17.22ms max=68.944ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=1] throughput",
            "value": 24.55,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=39.42ms max=47.841ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=10] throughput",
            "value": 64.65,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=138.805ms max=181.142ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 359.94,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.968ms max=6.914ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 640.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=14.696ms max=48.136ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5] throughput",
            "value": 0.84,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1186.988ms max=1222.64ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 41.15,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=24.297ms max=24.527ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5] throughput",
            "value": 2.68,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=369.623ms max=391.643ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5] throughput",
            "value": 1.88,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=529.007ms max=542.638ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5] throughput",
            "value": 4.57,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=218.497ms max=221.512ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 19.18,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=52.265ms max=52.986ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 5.99,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=167.51ms max=168.952ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 21.46,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=46.334ms max=47.94ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 103.24,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=9.29ms max=11.469ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 0.99,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1008.206ms max=1018.167ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 41.53,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=23.953ms max=25.346ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 3.34,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=300.679ms max=305.398ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 2.37,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=419.955ms max=434.373ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 4.56,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=218.628ms max=224.264ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 18.95,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=52.953ms max=53.641ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 6,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=165.806ms max=171.311ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 23.2,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=42.566ms max=45.744ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 111.96,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=8.864ms max=9.56ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 723.11,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.325ms max=4.973ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 600.9,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.497ms max=7.877ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 545.05,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.746ms max=8.102ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 195.42,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.977ms max=8.774ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 188.11,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.944ms max=16.13ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 199.04,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.923ms max=7.926ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1052.3,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.019ms max=19.12ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 1106.94,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.253ms max=15.09ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 766.03,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=12.755ms max=18.317ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 356.99,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=27.443ms max=37.388ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 351.39,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=26.313ms max=70.386ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 353.44,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=27.427ms max=42.107ms"
          },
          {
            "name": "blog/MongoStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 9.24,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=101.45ms max=121.176ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 273.43,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.523ms max=6.316ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 352.76,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.521ms max=9.232ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 594.53,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.452ms max=10.232ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 376.1,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.243ms max=7.713ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1060.45,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.807ms max=6.513ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1069.34,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.818ms max=5.8ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1211.19,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.715ms max=6.455ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 300.51,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.869ms max=14.402ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 482.84,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=16.048ms max=55.345ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 643.21,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=14.057ms max=38.797ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1031.7,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.511ms max=21.201ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 794.13,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=11.248ms max=47.546ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1374.84,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.886ms max=18.825ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1312.16,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=6.386ms max=18.072ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1746.3,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.542ms max=8.716ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 730.75,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=13.197ms max=23.429ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 335.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.941ms max=13.902ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 739.46,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=12.993ms max=56.525ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=1] throughput",
            "value": 25.37,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=38.404ms max=45.875ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=10] throughput",
            "value": 64.47,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=121.111ms max=186.909ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 393.25,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.384ms max=14.139ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 867.42,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.092ms max=31.949ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 771.03,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.251ms max=4.727ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 690.33,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.374ms max=6.521ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 582.13,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.651ms max=7.487ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 228.78,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.223ms max=7.995ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 216.17,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.151ms max=13.296ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 222.27,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.239ms max=10.879ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1173.43,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=7.954ms max=16.351ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 1275.72,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=7.463ms max=16.99ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 798.88,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=12.001ms max=19.808ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 434.51,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=22.954ms max=29.147ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 418.63,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=23.02ms max=46.596ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 368.75,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=25.444ms max=50.397ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5] throughput",
            "value": 0.88,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=1142.948ms max=1146.094ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 38.99,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=25.608ms max=27.705ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5] throughput",
            "value": 2.69,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=370.672ms max=374.866ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5] throughput",
            "value": 2.03,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=492.044ms max=496.501ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5] throughput",
            "value": 4.9,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=204.866ms max=209.191ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 19.69,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=50.627ms max=51.446ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 6.52,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=154.272ms max=157.811ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 21.36,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=44.696ms max=55.411ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 139.48,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=7.131ms max=7.59ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 1.02,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=974.127ms max=1000.342ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 39.54,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=24.723ms max=27.935ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 3.33,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=300.155ms max=306.708ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 2.47,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=402.653ms max=422.052ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 4.87,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=205.783ms max=207.225ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 19.61,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=50.954ms max=51.773ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 6.47,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=155.451ms max=156.238ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 23.77,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=41.681ms max=43.745ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 142.96,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=7.041ms max=7.639ms"
          },
          {
            "name": "blog/PostgresStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 8.96,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=102.957ms max=132.055ms"
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
          "id": "cde78c29797a184ad4d6451479d848473d5ccdeb",
          "message": "ci: parallel static checks job, lint only changed files on pull requests (#1071)\n\n* ci: run lint and static checks in a parallel job, cache the pnpm store\n\nFormatting, lint, the published files check and the circular dependency\ncheck need neither the build nor the test services. They ran in series\naround the tests (about 95s): they now have their own job.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n* ci: drop the pnpm store cache, the lockfile is not committed\n\nsetup-node needs pnpm-lock.yaml to key the cache and fails without it.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Fable 5.2 <noreply@anthropic.com>",
          "timestamp": "2026-11-13T20:37:01Z",
          "url": "https://github.com/loopingz/webda.io/commit/cde78c29797a184ad4d6451479d848473d5ccdeb"
        },
        "date": 1794627729749,
        "tool": "customBiggerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 178348.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.005ms max=0.058ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 230627.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.037ms max=0.128ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.31,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.612ms max=1.93ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 19733.21,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=10.027ms max=46.891ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 50294.22,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=12.599ms max=15.491ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 20183.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=46.268ms max=48.89ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 5354.18,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.171ms max=0.504ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 4697.26,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.164ms max=0.752ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 81566.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.01ms max=0.312ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 147754.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.059ms max=0.17ms"
          },
          {
            "name": "queue/AMQPQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 48.02,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=10427.04ms max=20837.302ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 401.47,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1278.214ms max=2491.417ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 402.37,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1266.68ms max=2487.222ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3249.57,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=175.899ms max=308.019ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 3835.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=139.33ms max=260.833ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 99.21,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=20.857ms max=41.615ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 632.74,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.556ms max=4.379ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 960.56,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=9.478ms max=20.972ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 602.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1352.663ms max=1673.527ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 694.12,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1413.48ms max=1546.65ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 188.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3168.797ms max=5330.96ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 189.04,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3147.825ms max=5301.6ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 715.02,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1233.125ms max=1417.675ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 260.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2443.182ms max=3846.177ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.25,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=2.357ms max=5.108ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 332.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.922ms max=8.294ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 344.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.847ms max=5.374ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 272.34,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.582ms max=8.634ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 262.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.729ms max=8.413ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 274.12,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.596ms max=6.279ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 282.04,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.449ms max=7.741ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 127.61,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=8.602ms max=13.246ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 19.02,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=52.036ms max=61.702ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 18.19,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=54.723ms max=84.607ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 19.95,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=49.25ms max=72.614ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 13.98,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=71.107ms max=81.527ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 289,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.402ms max=17.695ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 277.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.232ms max=320.078ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 486.16,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=20.709ms max=59.277ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 505.42,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=19.972ms max=41.058ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 457,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.955ms max=64.651ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 452.5,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=22.315ms max=42.533ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 454.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=22.004ms max=40.862ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 473.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.086ms max=42.402ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 190.87,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=50.921ms max=93.782ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 23.18,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=427.819ms max=524.55ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 16.86,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=589.3ms max=684.196ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 29.37,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=342.36ms max=439.615ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 19.19,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=519.307ms max=622.33ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 461.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.84ms max=45.679ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 471.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.168ms max=45.416ms emulated"
          },
          {
            "name": "store/DynamoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 414.68,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=21.234ms max=347.079ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 5.07,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=201.589ms max=203.031ms emulated"
          },
          {
            "name": "store/DynamoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 5.38,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=184.943ms max=188.482ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 232072.41,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.003ms max=0.313ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 356887.94,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.025ms max=0.152ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 33779.22,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=23.97ms max=29.59ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 51628.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=16.81ms max=19.382ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 453.04,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1110.442ms max=2208.301ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 453.84,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1109.393ms max=2204.107ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3904.77,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=145.359ms max=256.246ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 4126.18,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=130.351ms max=242.483ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.33,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.071ms max=80.151ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 112956.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.198ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 337609.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.003ms max=0.028ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 60375.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.012ms max=3.052ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 50743.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.013ms max=0.098ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 53859,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.013ms max=0.085ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 45161,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.016ms max=0.993ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 29107,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.033ms max=0.082ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 829.47,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.143ms max=1.893ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 289.82,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=3.34ms max=5.247ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1286.42,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.707ms max=3.34ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 156.5,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=6.246ms max=7.524ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 33499.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.028ms max=0.231ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 517866.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.001ms max=0.169ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 238095.24,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.039ms max=0.113ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 508130.08,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.018ms max=0.045ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 114090.13,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.083ms max=0.144ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 59545.08,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.168ms max=0.252ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 59220.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.165ms max=0.238ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 50050.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.186ms max=0.946ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 30145.91,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.326ms max=0.568ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 924.42,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=10.666ms max=11.575ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 320.11,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=31.179ms max=32.031ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1797.79,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=5.485ms max=5.825ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 126.29,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=78.905ms max=81.068ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 33876.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.283ms max=0.489ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 883392.23,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.009ms max=0.064ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 33151,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.287ms max=0.488ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 87.47,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=11.682ms max=13.132ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 94.95,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=10.265ms max=11.682ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 157480.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.005ms max=0.19ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 156176.79,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.037ms max=2.525ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.106ms max=3.064ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 126358.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.26ms max=4.874ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 164744.65,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.062ms max=3.449ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 201816.35,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.583ms max=4.102ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 26702.27,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.036ms max=0.177ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 7756.15,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.14ms max=0.284ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 63901.85,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.013ms max=0.584ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 79649.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.116ms max=0.337ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 502.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1518.338ms max=1989.149ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 508.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1499.464ms max=1968.177ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 247.03,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2514.485ms max=4049.601ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 246.99,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2518.68ms max=4049.601ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 472.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1598.03ms max=2117.075ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 485.52,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1540.358ms max=2060.452ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.315ms max=1.141ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 79814.83,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.011ms max=0.226ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 140016.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.036ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 20794.78,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.042ms max=0.28ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 18640.37,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.047ms max=1.857ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 18906.81,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.05ms max=0.238ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 16785.85,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.055ms max=0.526ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 14425.02,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.063ms max=0.271ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 85.46,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=11.567ms max=14.377ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 76.63,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=12.919ms max=15.196ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 99.69,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=9.912ms max=11.796ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 49.23,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=19.874ms max=27.754ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 23790.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.039ms max=0.317ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 110864.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.008ms max=0.231ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 115380.18,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.08ms max=0.301ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 233699.46,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.04ms max=0.117ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 23049.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.455ms max=0.766ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 20880.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.444ms max=0.786ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 20741.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.447ms max=1.12ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 20724.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.463ms max=0.698ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 15090.7,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.662ms max=1.067ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 64.42,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=154.796ms max=157.942ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 61.99,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=161.087ms max=163.316ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 75.57,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=132.121ms max=134.021ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 37.51,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=266.076ms max=271.581ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 23871.48,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.407ms max=0.738ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 121521.45,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.078ms max=0.215ms"
          },
          {
            "name": "store/FileStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 11211.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.854ms max=2.349ms"
          },
          {
            "name": "store/FileStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 4.03,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=250.348ms max=253.886ms"
          },
          {
            "name": "store/FileStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 4.14,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=240.648ms max=243.27ms"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 91.44,
            "unit": "ops/s",
            "extra": "ops=915 errors=0 p50=11.01ms max=17.482ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 862.76,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.461ms max=17.58ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 99.81,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=33.26ms max=61.538ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 865.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=36.307ms max=62.03ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 91.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=35.652ms max=61.276ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 455.57,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=33.882ms max=63.963ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 19.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=50.102ms max=50.43ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 19.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=50.102ms max=50.397ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 88.6,
            "unit": "ops/s",
            "extra": "ops=887 errors=0 p50=11.37ms max=21.987ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 832.84,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.6ms max=22.086ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 817.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1040.712ms max=1276.117ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 1011.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=841.482ms max=1064.829ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 1006.55,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=827.851ms max=1067.45ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 1003.16,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=816.841ms max=1056.44ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 443.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.146ms max=13.091ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 524.51,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.854ms max=11.239ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 246.12,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.916ms max=17.416ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 263.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.693ms max=13.386ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 271.09,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.535ms max=15.434ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1141.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.828ms max=8.147ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 201.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.751ms max=22.413ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 81.46,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=11.182ms max=21.119ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 92.06,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=10.068ms max=55.738ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 62.09,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=15.983ms max=19.661ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 185.64,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=5.263ms max=8.954ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1006.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.885ms max=9.544ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 267.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.631ms max=14ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3026.61,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.875ms max=9.83ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3505.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.499ms max=10.437ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1452.64,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=6.267ms max=14.238ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 310.95,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.919ms max=3126.854ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 266.2,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=4.743ms max=3275.751ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2743.33,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.351ms max=9.667ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1006.97,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=10.453ms max=31.539ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 134.23,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=71.107ms max=132.317ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 157.23,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=60.555ms max=104.53ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 107.41,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=90.636ms max=152.044ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 340.47,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=28.852ms max=47.841ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2728.3,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=3.125ms max=17.711ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1829.21,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=5.202ms max=13.992ms emulated"
          },
          {
            "name": "store/FireStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3457.53,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.644ms max=10.445ms emulated"
          },
          {
            "name": "store/FireStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 3.04,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=297.533ms max=400.032ms emulated"
          },
          {
            "name": "store/FireStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 3.35,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=297.796ms max=303.301ms emulated"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4349.15,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.198ms max=2.589ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3718.36,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.278ms max=1.773ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3399.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.24ms max=1.143ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4239.16,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.192ms max=0.695ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4617.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.179ms max=1.069ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 5805.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.125ms max=0.958ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1699.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.553ms max=2.671ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 725.58,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.358ms max=1.96ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 705.21,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.386ms max=1.695ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 837.67,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.152ms max=1.508ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 617.46,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.558ms max=2.492ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 5043.65,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.191ms max=1.362ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 6012.87,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.166ms max=0.976ms"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 12135.63,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.66ms max=3.398ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 13120.09,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.615ms max=3.148ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 9484.25,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.931ms max=3.791ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 9680.54,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.946ms max=3.23ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 9998.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.971ms max=3.301ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 17056.99,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.484ms max=1.506ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3917.39,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.31ms max=6.951ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 906.72,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=8.741ms max=28.606ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 962.71,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=10.043ms max=22.036ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1083.99,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=7.86ms max=19.153ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 549.83,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=17.22ms max=29.753ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 13060.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.624ms max=4.456ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 19001.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.421ms max=3.119ms"
          },
          {
            "name": "store/MongoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 15057.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.523ms max=6.287ms"
          },
          {
            "name": "store/MongoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 29.16,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=33.98ms max=38.011ms"
          },
          {
            "name": "store/MongoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 28.32,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=35.291ms max=35.652ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 8149.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.119ms max=0.947ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 23205.63,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.358ms max=4.346ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.357ms max=1.42ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 20829.43,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.36ms max=1.3ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 7360.57,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.163ms max=0.367ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 28920.12,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.197ms max=1.112ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 5553.4,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.174ms max=0.265ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 4722.06,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.216ms max=1.092ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 10827.2,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.804ms max=9.085ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 4095.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=160.694ms max=246.022ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 15176.81,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=73.466ms max=87.884ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3089.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=207.356ms max=325.845ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 406.16,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1258.291ms max=2464.154ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 3152.15,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=204.341ms max=319.554ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 411.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1261.437ms max=2434.793ms"
          },
          {
            "name": "queue/PostgresQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.3,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=1.076ms max=2.3ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 6816.91,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.143ms max=0.58ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 9003.33,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.107ms max=0.291ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 3275.32,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.304ms max=1.757ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4025.17,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.254ms max=0.608ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4087.67,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.259ms max=0.636ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 4347.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.241ms max=0.577ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 2133.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.426ms max=1.219ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1133.32,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.862ms max=1.534ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1105.36,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.852ms max=1.332ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1472.17,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.629ms max=1.238ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1013.19,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.954ms max=1.424ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 5102.67,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.187ms max=3.461ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 6261.82,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.159ms max=0.545ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 28141.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.322ms max=1.446ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 30644.77,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.296ms max=1.097ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 14364.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.667ms max=1.665ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 15624.02,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.618ms max=1.724ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 15063.19,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.629ms max=2.482ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 16075.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.602ms max=1.46ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 7616.2,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.226ms max=5.28ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2411.67,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=3.672ms max=7.885ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2012.96,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=4.42ms max=10.723ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2272.31,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=3.842ms max=8.7ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 3040.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=3.064ms max=6.91ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 19598.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.459ms max=2.765ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 26319.95,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.354ms max=1.42ms"
          },
          {
            "name": "store/PostgresStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 8385.81,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.947ms max=6.64ms"
          },
          {
            "name": "store/PostgresStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 54.93,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=16.892ms max=21.316ms"
          },
          {
            "name": "store/PostgresStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 50.92,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=19.251ms max=20.742ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=1,subscribers=0] throughput",
            "value": 50548.45,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.011ms max=3.168ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=10,subscribers=0] throughput",
            "value": 60897.63,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.107ms max=1.831ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] throughput",
            "value": 100.33,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.155ms max=2.124ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] throughput",
            "value": 29538.61,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.1ms max=2.531ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=1000,subscribers=1] throughput",
            "value": 28925.14,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.023ms max=2.088ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=200,subscribers=5] throughput",
            "value": 57359.18,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.052ms max=0.775ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=100,subscribers=1] throughput",
            "value": 21294.72,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.027ms max=1.64ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=10240,subscribers=1] throughput",
            "value": 18705.57,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.044ms max=0.272ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=1,payloadBytes=100] throughput",
            "value": 57405.28,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.011ms max=1.712ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=10,payloadBytes=100] throughput",
            "value": 59343.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.103ms max=2.302ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=1,messages=1000] throughput",
            "value": 55660.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=17.449ms max=18.022ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=10,messages=1000] throughput",
            "value": 59393,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=16.499ms max=18.76ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 4156.22,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=131.269ms max=240.779ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 456.63,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1111.491ms max=2191.524ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] throughput",
            "value": 4237.74,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=125.37ms max=236.061ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] throughput",
            "value": 459.38,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1098.908ms max=2178.941ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] throughput",
            "value": 100.32,
            "unit": "ops/s",
            "extra": "ops=300 errors=0 p50=0.182ms max=2.312ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 49341.29,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.01ms max=7.242ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 169721.66,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.006ms max=0.068ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 40176.78,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.02ms max=2.284ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 42308.34,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.022ms max=2.012ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 46836.21,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.016ms max=1.974ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 52443.89,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.015ms max=1.949ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 25123.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.032ms max=2.017ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1357.59,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.703ms max=1.086ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1096.44,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.871ms max=1.68ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 1955.76,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=0.492ms max=0.778ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 794.01,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=1.226ms max=1.897ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 44169.61,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.016ms max=2.255ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=1,dataset=1000,docSize=small] throughput",
            "value": 66867.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.008ms max=1.774ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 146713.62,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.065ms max=0.106ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 197980.6,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.048ms max=0.117ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 56541.9,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.153ms max=2.011ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 59740.73,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.14ms max=2.077ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 69295.27,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.13ms max=1.041ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 71214.93,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.096ms max=2.267ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 33468.32,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.295ms max=2.388ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1899.88,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=5.12ms max=6.521ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 1322.19,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=7.213ms max=9.929ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 2198.09,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=4.362ms max=6.537ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 691.36,
            "unit": "ops/s",
            "extra": "ops=100 errors=0 p50=14.459ms max=17.252ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 43007.05,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.165ms max=2.318ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 76657.72,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.092ms max=1.934ms"
          },
          {
            "name": "store/SQLiteStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] throughput",
            "value": 86244.07,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=0.093ms max=1.794ms"
          },
          {
            "name": "store/SQLiteStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 47.41,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=19.464ms max=24.445ms"
          },
          {
            "name": "store/SQLiteStore/store.iterate[dataset=1000,docSize=small,pageSize=100] throughput",
            "value": 47.84,
            "unit": "ops/s",
            "extra": "ops=3 errors=0 p50=20.955ms max=21.217ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 1171.43,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.813ms max=4.493ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 1087.61,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.848ms max=6.93ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 784.94,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.203ms max=7.365ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 102.12,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.658ms max=11.952ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 100.58,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.544ms max=21.742ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 100.28,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.658ms max=21.414ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1927.71,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.014ms max=13.656ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 2442.69,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.951ms max=12.149ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 1127.43,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.311ms max=15.884ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 103.73,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=94.372ms max=127.205ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 101.42,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=89.719ms max=166.986ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 101.9,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=96.535ms max=123.47ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5] throughput",
            "value": 1.45,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=674.759ms max=739.246ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 50.81,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=19.923ms max=21.545ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5] throughput",
            "value": 4.38,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=227.41ms max=231.211ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5] throughput",
            "value": 3.66,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=273.154ms max=276.038ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5] throughput",
            "value": 6.97,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=125.895ms max=187.957ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 28.46,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=35.029ms max=35.455ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 9.23,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=90.833ms max=152.568ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 36.76,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=26.968ms max=27.951ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 424.3,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=2.322ms max=2.437ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 1.75,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=563.085ms max=595.067ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 53.6,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=18.055ms max=20.791ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 5.8,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=172.491ms max=176.685ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 4.84,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=205.652ms max=209.453ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 6.68,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=137.495ms max=174.326ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 28.08,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=35.586ms max=36.438ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 8.76,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=101.122ms max=138.805ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 40.51,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=24.56ms max=26.395ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 415.73,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=2.367ms max=2.574ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 109.29,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.019ms max=11.633ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 84.02,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=11.698ms max=20.759ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 387.67,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.415ms max=8.159ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 336.28,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.791ms max=9.667ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 3602.24,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.172ms max=5.886ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 5380.54,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.172ms max=0.379ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 4092.83,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.154ms max=4.76ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 339.06,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.775ms max=11.993ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 94.13,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=104.595ms max=127.336ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 76.82,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=128.778ms max=151.388ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 426.4,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=22.397ms max=42.697ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 376.63,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=25.231ms max=45.449ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 4834.19,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.345ms max=7.655ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 3738.18,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.136ms max=9.404ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 8198.07,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.127ms max=2.38ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 380.39,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=24.986ms max=47.415ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 107.75,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=12.173ms max=22.921ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 94.66,
            "unit": "ops/s",
            "extra": "ops=955 errors=0 p50=113.77ms max=217.317ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=1] throughput",
            "value": 33.99,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=28.705ms max=33.62ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=10] throughput",
            "value": 94.22,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=87.884ms max=128.647ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 135.71,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=9.134ms max=21.398ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 119.49,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=81.002ms max=176.685ms"
          },
          {
            "name": "blog/MemoryStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 10.58,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=84.279ms max=131.924ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 312.9,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.121ms max=5.247ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 389.54,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.273ms max=7.631ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 652.44,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.445ms max=6.418ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 382.32,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.357ms max=8.09ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1304.55,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.642ms max=7.68ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1558.18,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.622ms max=0.929ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1275.21,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.634ms max=5.222ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 345.18,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.482ms max=9.11ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 578.01,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=13.943ms max=44.171ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 696.65,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=12.509ms max=41.091ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 967.61,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.073ms max=36.274ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 792.75,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=11.575ms max=35.783ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1439.3,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.555ms max=71.696ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1413.19,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.206ms max=63.701ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1871.98,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.993ms max=11.436ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 740.03,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=13.304ms max=22.069ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 402.91,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.712ms max=10.559ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 824.88,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=11.657ms max=33.014ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=1] throughput",
            "value": 32.05,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=30.458ms max=35.193ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=10] throughput",
            "value": 92.33,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=89.26ms max=137.101ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 489.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.193ms max=4.375ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 943.26,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=10.043ms max=29.753ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5] throughput",
            "value": 1.33,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=754.45ms max=760.742ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 53.36,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=18.612ms max=19.775ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5] throughput",
            "value": 4.33,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=232.26ms max=233.57ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5] throughput",
            "value": 3.08,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=325.845ms max=328.204ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5] throughput",
            "value": 6.68,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=150.34ms max=150.995ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 30.44,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=32.67ms max=33.948ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 8.56,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=117.506ms max=117.703ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 32.46,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=30.884ms max=31.146ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 163,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=6.181ms max=6.3ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 1.62,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=619.708ms max=624.951ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 50.93,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=19.497ms max=20.84ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 5.76,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=173.015ms max=177.603ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 4.12,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=241.304ms max=248.25ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 6.54,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=151.519ms max=162.66ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 30.31,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=32.784ms max=33.817ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 8.34,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=118.751ms max=129.827ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 35.43,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=28ms max=29.065ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 164.27,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=6.205ms max=6.271ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 834.44,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.18ms max=1.606ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 723.1,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.202ms max=12.698ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 612.96,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.556ms max=7.651ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 261.37,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.738ms max=6.058ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 259.13,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.641ms max=10.904ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 262.02,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.738ms max=6.476ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1298.55,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=7.274ms max=15.016ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 1942.43,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.919ms max=9.38ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 913.15,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=10.461ms max=20.251ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 467.89,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=19.186ms max=52.363ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 482.79,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=19.972ms max=42.467ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 449.19,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=21.398ms max=29.295ms"
          },
          {
            "name": "blog/MongoStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 14.71,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=66.191ms max=77.791ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 379.9,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.548ms max=4.037ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 444.64,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.014ms max=9.093ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 740.9,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.203ms max=8.659ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 491.27,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.845ms max=7.733ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1353.79,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.62ms max=4.108ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1411.29,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.63ms max=4.121ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 1631.75,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=0.531ms max=4.086ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 431.97,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=2.055ms max=8.294ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 666.86,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=10.945ms max=44.27ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 950.08,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.683ms max=35.783ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1182.34,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=6.664ms max=29.245ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1078.17,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=7.598ms max=39.485ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 2191.49,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.74ms max=13.337ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1910.33,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=4.159ms max=13.361ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 2720.53,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.666ms max=5.169ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1131.7,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=8.643ms max=13.738ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] throughput",
            "value": 490.8,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=2.138ms max=8.315ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] throughput",
            "value": 1056.69,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=8.684ms max=38.011ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=1] throughput",
            "value": 33.58,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=29ms max=35.258ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=10] throughput",
            "value": 97.15,
            "unit": "ops/s",
            "extra": "ops=20 errors=0 p50=85.262ms max=125.567ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] throughput",
            "value": 604.31,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=1.761ms max=3.633ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] throughput",
            "value": 1225.1,
            "unit": "ops/s",
            "extra": "ops=1000 errors=0 p50=7.574ms max=24.248ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=1,posts=1000] throughput",
            "value": 869.31,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.11ms max=4.176ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=1,posts=1000] throughput",
            "value": 878.36,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.094ms max=5.378ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=1,posts=1000] throughput",
            "value": 641.28,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=1.484ms max=6.484ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=1,posts=1000] throughput",
            "value": 308.84,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.148ms max=6.16ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=1,posts=1000] throughput",
            "value": 307.39,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.006ms max=12.263ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=1,posts=1000] throughput",
            "value": 309.98,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.138ms max=6.201ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=10,posts=1000] throughput",
            "value": 1653.58,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=5.657ms max=9.495ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=10,posts=1000] throughput",
            "value": 2202.01,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=3.994ms max=14.696ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=10,posts=1000] throughput",
            "value": 1073.84,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=9.052ms max=13.918ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=10,posts=1000] throughput",
            "value": 599.46,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=16.318ms max=24.51ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=10,posts=1000] throughput",
            "value": 673.1,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=14.811ms max=22.413ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=10,posts=1000] throughput",
            "value": 554.6,
            "unit": "ops/s",
            "extra": "ops=200 errors=0 p50=18.137ms max=24.232ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5] throughput",
            "value": 1.41,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=705.692ms max=734.003ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5] throughput",
            "value": 52.12,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=18.842ms max=20.627ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5] throughput",
            "value": 4.37,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=228.852ms max=231.473ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5] throughput",
            "value": 3.4,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=295.698ms max=297.271ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5] throughput",
            "value": 7.36,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=132.776ms max=149.029ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5] throughput",
            "value": 31.72,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=31.244ms max=32.571ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5] throughput",
            "value": 9.59,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=101.581ms max=116.392ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5] throughput",
            "value": 31.26,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=29.655ms max=41.026ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5] throughput",
            "value": 202.58,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=4.776ms max=5.874ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5,compileCache=true] throughput",
            "value": 1.77,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=567.804ms max=570.425ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5,compileCache=true] throughput",
            "value": 52.04,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=18.694ms max=20.333ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5,compileCache=true] throughput",
            "value": 5.85,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=170.525ms max=173.801ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5,compileCache=true] throughput",
            "value": 4.59,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=218.497ms max=220.07ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5,compileCache=true] throughput",
            "value": 7.66,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=132.448ms max=135.004ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5,compileCache=true] throughput",
            "value": 32.14,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=31.212ms max=31.457ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5,compileCache=true] throughput",
            "value": 10.06,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=101.253ms max=103.481ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5,compileCache=true] throughput",
            "value": 35.76,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=26.214ms max=35.684ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5,compileCache=true] throughput",
            "value": 214.37,
            "unit": "ops/s",
            "extra": "ops=5 errors=0 p50=4.665ms max=4.801ms"
          },
          {
            "name": "blog/PostgresStore/blog.boot[audit=true,mode=warm] throughput",
            "value": 15.03,
            "unit": "ops/s",
            "extra": "ops=6 errors=0 p50=66.781ms max=73.859ms"
          }
        ]
      }
    ],
    "p99 latency (quick)": [
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
          "id": "d992918039c3f7006c8c522ea250d70027a10f99",
          "message": "fix: sqlite on Node 22, stable gcp module file, deterministic downloadTo test (#1070)\n\n* fix(sqlite): bind numbered parameters on Node 22\n\nnode:sqlite on Node 22 does not bind positional values to numbered\nparameters (?1, ?2): every statement with a value failed with 'column index\nout of range'. The binding is probed once, and values are passed by name\nwhere positional binding is not available. Later Node versions keep binding\nby position.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n* test(core): make the downloadTo write error test deterministic\n\nThe stubbed service returned no stream, so pipe() threw before the write\nstream reported its error: the handler ran after the test or not at all, and\nline coverage of binary.service.ts moved between 100% and 99.96%.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n* fix(content-mapper): leave ES private fields out of the schemas\n\nA #private field of a class reached the schema under the name the compiler\ngives it (__#<n>@#private), with a counter that depends on the order the\nclasses were checked in: the gcp module file changed on every build.\n\nThe gcp module file is regenerated: the private names are gone, and it picks\nup the signal option of google-gax 6.16 that the committed file was missing.\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Fable 5.2 <noreply@anthropic.com>",
          "timestamp": "2026-11-13T00:01:34Z",
          "url": "https://github.com/loopingz/webda.io/commit/d992918039c3f7006c8c522ea250d70027a10f99"
        },
        "date": 1794541402442,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.042,
            "range": "± 0.033",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.972ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.259,
            "range": "± 0.055",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.077ms max=0.596ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 1.104,
            "range": "± 0.144",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.451ms max=2.13ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] p99",
            "value": 30.097,
            "range": "± 6.048",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=22.97ms max=30.13ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=1000,subscribers=1] p99",
            "value": 50.201,
            "range": "± 8.198",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=21.086ms max=50.201ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.fanout[messages=200,subscribers=5] p99",
            "value": 56.459,
            "range": "± 17.99",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=52.462ms max=56.492ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.477,
            "range": "± 0.036",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.373ms max=0.487ms"
          },
          {
            "name": "pubsub/AMQPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.759,
            "range": "± 0.08",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.486ms max=0.861ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.085,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.017ms max=0.596ms"
          },
          {
            "name": "queue/AMQPQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.252,
            "range": "± 0.034",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.103ms max=0.269ms"
          },
          {
            "name": "queue/AMQPQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 20350.763,
            "range": "± 5930.033",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=10292.822ms max=20568.867ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 2480.931,
            "range": "± 706.542",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1287.651ms max=2503.999ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2478.834,
            "range": "± 703.278",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1292.894ms max=2501.902ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 343.671,
            "range": "± 83.011",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=200.671ms max=346.554ms"
          },
          {
            "name": "queue/AMQPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 336.593,
            "range": "± 81.013",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=200.933ms max=339.214ms"
          },
          {
            "name": "queue/AMQPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 40.108,
            "range": "± 11.7",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=20.333ms max=41.222ms"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 2.867,
            "range": "± 0.257",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.836ms max=4.944ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 24.478,
            "range": "± 3.965",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=13.099ms max=26.329ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=1,messages=1000] p99",
            "value": 2003.829,
            "range": "± 164.312",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1724.908ms max=2023.752ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 1881.145,
            "range": "± 119.184",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1591.738ms max=1943.011ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 5997.855,
            "range": "± 1331.899",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3730.833ms max=6043.992ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 5972.689,
            "range": "± 1275.395",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3869.245ms max=6018.826ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 1867.514,
            "range": "± 133.748",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1648.361ms max=1876.951ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 4196.401,
            "range": "± 784.667",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2881.487ms max=4221.567ms emulated"
          },
          {
            "name": "queue/SQSQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 4.284,
            "range": "± 0.374",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=2.804ms max=5.906ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.033,
            "range": "± 0.843",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.598ms max=11.174ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 4.903,
            "range": "± 0.327",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.418ms max=6.603ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.254,
            "range": "± 0.762",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.919ms max=19.038ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.901,
            "range": "± 0.693",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=5.124ms max=11.952ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.623,
            "range": "± 0.705",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.833ms max=17.727ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.266,
            "range": "± 0.782",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.719ms max=15.032ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 14.828,
            "range": "± 2.084",
            "unit": "ms",
            "extra": "ops=991 errors=0 p50=11.084ms max=21.496ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 83.493,
            "range": "± 3.421",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=70.058ms max=84.148ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 72.483,
            "range": "± 3.372",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=66.847ms max=98.959ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 77.267,
            "range": "± 3.15",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=61.374ms max=79.167ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 109.052,
            "range": "± 4.492",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=86.966ms max=114.491ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.045,
            "range": "± 0.522",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=5.046ms max=9.069ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 7.569,
            "range": "± 11.288",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.841ms max=361.234ms emulated"
          },
          {
            "name": "store/DynamoStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 58.163,
            "range": "± 9.271",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=29.409ms max=64.225ms emulated"
          },
          {
            "name": "store/DynamoStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 49.906,
            "range": "± 8.37",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=28.049ms max=64.815ms emulated"
          },
          {
            "name": "store/DynamoStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 53.346,
            "range": "± 8.602",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=31.441ms max=64.324ms emulated"
          },
          {
            "name": "store/DynamoStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 56.394,
            "range": "± 8.844",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=33.653ms max=74.514ms emulated"
          },
          {
            "name": "store/DynamoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 59.408,
            "range": "± 8.933",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=33.161ms max=79.364ms emulated"
          },
          {
            "name": "store/DynamoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 51.642,
            "range": "± 7.846",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=29.917ms max=61.768ms emulated"
          },
          {
            "name": "store/DynamoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 120.062,
            "range": "± 19.504",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=72.548ms max=138.412ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 1370.489,
            "range": "± 120.994",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=984.089ms max=1402.995ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 865.599,
            "range": "± 69.849",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=753.402ms max=877.658ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 646.447,
            "range": "± 57.829",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=535.036ms max=732.43ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 424.149,
            "range": "± 39.284",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=332.399ms max=425.722ms emulated"
          },
          {
            "name": "store/DynamoStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 52.003,
            "range": "± 8.208",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=31.08ms max=67.011ms emulated"
          },
          {
            "name": "store/DynamoStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 61.833,
            "range": "± 36.297",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=28.852ms max=414.188ms emulated"
          },
          {
            "name": "store/DynamoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 51.053,
            "range": "± 8.269",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=29.786ms max=65.765ms emulated"
          },
          {
            "name": "store/DynamoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 304.873,
            "range": "± 22.442",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=285.737ms max=304.873ms emulated"
          },
          {
            "name": "store/DynamoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 255.459,
            "range": "± 2.789",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=254.935ms max=255.459ms emulated"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.026,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.007ms max=0.765ms"
          },
          {
            "name": "queue/MemoryQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.069,
            "range": "± 0.007",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.039ms max=0.086ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=1,messages=1000] p99",
            "value": 34.177,
            "range": "± 8.643",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=27.64ms max=34.21ms"
          },
          {
            "name": "queue/MemoryQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 18.055,
            "range": "± 4.099",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=15.376ms max=18.121ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 2214.593,
            "range": "± 643.587",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1130.365ms max=2237.661ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2189.427,
            "range": "± 636.759",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1119.879ms max=2210.398ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 248.906,
            "range": "± 67.891",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=140.64ms max=251.134ms"
          },
          {
            "name": "queue/MemoryQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 254.804,
            "range": "± 68.864",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=141.558ms max=256.901ms"
          },
          {
            "name": "queue/MemoryQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 50.135,
            "range": "± 8.165",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.067ms max=80.151ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.062,
            "range": "± 0.018",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.011ms max=0.45ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.016,
            "range": "± 0.004",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.004ms max=0.067ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.068,
            "range": "± 0.126",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.024ms max=3.994ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.083,
            "range": "± 0.015",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.022ms max=0.121ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.11,
            "range": "± 0.019",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.023ms max=0.154ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.104,
            "range": "± 0.025",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.028ms max=0.63ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.137,
            "range": "± 0.019",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.059ms max=0.209ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 3.152,
            "range": "± 0.271",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.844ms max=3.361ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 6.582,
            "range": "± 0.34",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=5.313ms max=8.073ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.967,
            "range": "± 0.183",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.042ms max=1.992ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 11.903,
            "range": "± 0.394",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=9.904ms max=11.985ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.124,
            "range": "± 0.025",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.043ms max=0.4ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.01,
            "range": "± 0.018",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.002ms max=0.532ms"
          },
          {
            "name": "store/MemoryStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.125,
            "range": "± 0.015",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.06ms max=0.159ms"
          },
          {
            "name": "store/MemoryStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.077,
            "range": "± 0.013",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.027ms max=0.111ms"
          },
          {
            "name": "store/MemoryStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.207,
            "range": "± 0.028",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.14ms max=0.372ms"
          },
          {
            "name": "store/MemoryStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.388,
            "range": "± 0.045",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.262ms max=0.409ms"
          },
          {
            "name": "store/MemoryStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.424,
            "range": "± 0.047",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.264ms max=0.427ms"
          },
          {
            "name": "store/MemoryStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.549,
            "range": "± 0.096",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.291ms max=1.08ms"
          },
          {
            "name": "store/MemoryStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.787,
            "range": "± 0.073",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.529ms max=1.14ms"
          },
          {
            "name": "store/MemoryStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 19.562,
            "range": "± 0.625",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=17.58ms max=19.562ms"
          },
          {
            "name": "store/MemoryStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 52.527,
            "range": "± 0.827",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=50.463ms max=52.527ms"
          },
          {
            "name": "store/MemoryStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 9.855,
            "range": "± 0.231",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=9.11ms max=9.855ms"
          },
          {
            "name": "store/MemoryStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 128.516,
            "range": "± 1.09",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=125.567ms max=128.516ms"
          },
          {
            "name": "store/MemoryStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.809,
            "range": "± 0.061",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.423ms max=0.84ms"
          },
          {
            "name": "store/MemoryStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.041,
            "range": "± 0.007",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.011ms max=0.056ms"
          },
          {
            "name": "store/MemoryStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.911,
            "range": "± 0.09",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.452ms max=0.981ms"
          },
          {
            "name": "store/MemoryStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 20.562,
            "range": "± 1.298",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=19.481ms max=20.562ms"
          },
          {
            "name": "store/MemoryStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 17.433,
            "range": "± 0.714",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=16.507ms max=17.433ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.05,
            "range": "± 0.012",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.008ms max=0.232ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 0.142,
            "range": "± 0.245",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.065ms max=2.562ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.355,
            "range": "± 0.228",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.085ms max=3.969ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] p99",
            "value": 7.418,
            "range": "± 0.396",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=6.439ms max=7.492ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=1000,subscribers=1] p99",
            "value": 6.083,
            "range": "± 0.541",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.583ms max=6.373ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.fanout[messages=200,subscribers=5] p99",
            "value": 7.93,
            "range": "± 1.625",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.907ms max=8.217ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.335,
            "range": "± 0.053",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.095ms max=0.34ms"
          },
          {
            "name": "pubsub/SocketPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.642,
            "range": "± 0.106",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.18ms max=0.787ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.107,
            "range": "± 0.017",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.047ms max=0.38ms"
          },
          {
            "name": "queue/FileQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 0.6,
            "range": "± 0.046",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.44ms max=0.735ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=1,messages=1000] p99",
            "value": 3955.229,
            "range": "± 1154.384",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2982.15ms max=3957.326ms"
          },
          {
            "name": "queue/FileQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 3988.783,
            "range": "± 1155.62",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3038.773ms max=3988.783ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 6115.295,
            "range": "± 1758.012",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4087.349ms max=6136.267ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 5997.855,
            "range": "± 1748.394",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3997.172ms max=6018.826ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 4068.475,
            "range": "± 1180.578",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3061.842ms max=4070.572ms"
          },
          {
            "name": "queue/FileQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 4045.406,
            "range": "± 1170.924",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3019.899ms max=4047.503ms"
          },
          {
            "name": "queue/FileQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 0.956,
            "range": "± 0.119",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.566ms max=2.222ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.078,
            "range": "± 0.018",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.027ms max=0.447ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.029,
            "range": "± 0.006",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.013ms max=0.046ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.263,
            "range": "± 0.057",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.152ms max=1.19ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.289,
            "range": "± 0.058",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.187ms max=1.398ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.316,
            "range": "± 0.064",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.197ms max=1.498ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.301,
            "range": "± 0.175",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.206ms max=5.681ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.319,
            "range": "± 0.08",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.19ms max=1.303ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 29.016,
            "range": "± 0.791",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=26.1ms max=30.278ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 32.276,
            "range": "± 0.993",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=28.885ms max=35.226ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 23.658,
            "range": "± 0.461",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=22.02ms max=23.921ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 59.277,
            "range": "± 3.055",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=44.532ms max=61.473ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.163,
            "range": "± 0.017",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.101ms max=0.322ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.068,
            "range": "± 0.012",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.022ms max=0.255ms"
          },
          {
            "name": "store/FileStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.294,
            "range": "± 0.066",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.171ms max=0.804ms"
          },
          {
            "name": "store/FileStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.164,
            "range": "± 0.024",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.077ms max=0.205ms"
          },
          {
            "name": "store/FileStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.556,
            "range": "± 0.162",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.724ms max=2.607ms"
          },
          {
            "name": "store/FileStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.105,
            "range": "± 0.168",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.805ms max=3.197ms"
          },
          {
            "name": "store/FileStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.488,
            "range": "± 1.269",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.076ms max=14.705ms"
          },
          {
            "name": "store/FileStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.514,
            "range": "± 0.265",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.12ms max=3.951ms"
          },
          {
            "name": "store/FileStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.998,
            "range": "± 0.595",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.897ms max=7.418ms"
          },
          {
            "name": "store/FileStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 354.157,
            "range": "± 1.858",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=349.7ms max=354.157ms"
          },
          {
            "name": "store/FileStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 366.215,
            "range": "± 4.756",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=356.516ms max=366.215ms"
          },
          {
            "name": "store/FileStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 297.271,
            "range": "± 3.258",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=290.718ms max=297.271ms"
          },
          {
            "name": "store/FileStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 598.213,
            "range": "± 4.381",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=588.775ms max=598.213ms"
          },
          {
            "name": "store/FileStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 1.385,
            "range": "± 0.087",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.916ms max=1.61ms"
          },
          {
            "name": "store/FileStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.436,
            "range": "± 0.04",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.218ms max=0.459ms"
          },
          {
            "name": "store/FileStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.131,
            "range": "± 0.617",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.296ms max=7.95ms"
          },
          {
            "name": "store/FileStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 554.172,
            "range": "± 6.636",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=551.551ms max=554.172ms"
          },
          {
            "name": "store/FileStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 550.502,
            "range": "± 8.315",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=541.59ms max=550.502ms"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 12.034,
            "range": "± 0.521",
            "unit": "ms",
            "extra": "ops=922 errors=0 p50=10.871ms max=19.005ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 13.967,
            "range": "± 0.989",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=11.821ms max=20.316ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 57.672,
            "range": "± 14.298",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=34.406ms max=57.868ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] p99",
            "value": 60.85,
            "range": "± 14.265",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=36.241ms max=63.373ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=1000,subscribers=1] p99",
            "value": 60.424,
            "range": "± 14.495",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=35.521ms max=66.486ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.fanout[messages=200,subscribers=5] p99",
            "value": 60.588,
            "range": "± 14.519",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=35.619ms max=66.879ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 50.495,
            "range": "± 0.168",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=50.135ms max=50.889ms emulated"
          },
          {
            "name": "pubsub/GCPPubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 50.463,
            "range": "± 0.143",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=50.135ms max=50.495ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 12.198,
            "range": "± 0.63",
            "unit": "ms",
            "extra": "ops=889 errors=0 p50=11.264ms max=21.086ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 26.116,
            "range": "± 3.537",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=11.911ms max=56.885ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 1389.363,
            "range": "± 120.524",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1156.579ms max=1394.606ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 1062.732,
            "range": "± 114.339",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=856.162ms max=1067.975ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 1077.936,
            "range": "± 115.564",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=853.541ms max=1081.082ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 1062.732,
            "range": "± 88.335",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=904.921ms max=1071.645ms emulated"
          },
          {
            "name": "queue/GCPQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 3135.242,
            "range": "± 884.854",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=1639.973ms max=3164.602ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 4.62,
            "range": "± 0.88",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.281ms max=16.122ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.718,
            "range": "± 0.533",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.985ms max=11.1ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 8.114,
            "range": "± 0.959",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.141ms max=16.843ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 6.402,
            "range": "± 0.901",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.965ms max=18.629ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 5.12,
            "range": "± 0.7",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.721ms max=15.524ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.314,
            "range": "± 0.465",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.911ms max=9.503ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 12.345,
            "range": "± 2.809",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=6.308ms max=31.621ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 32.195,
            "range": "± 3.784",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=14.033ms max=34.275ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 17.367,
            "range": "± 1.287",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=11.969ms max=17.383ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 24.674,
            "range": "± 1.625",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=18.989ms max=25.33ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 12.132,
            "range": "± 1.176",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=6.136ms max=13.033ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.17,
            "range": "± 0.368",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.791ms max=8.888ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 5.542,
            "range": "± 0.764",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.459ms max=19.12ms emulated"
          },
          {
            "name": "store/FireStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 14.868,
            "range": "± 2.179",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.135ms max=22.381ms emulated"
          },
          {
            "name": "store/FireStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 14.066,
            "range": "± 1.756",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=3.973ms max=16.564ms emulated"
          },
          {
            "name": "store/FireStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 18.858,
            "range": "± 2.382",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=8.356ms max=22.036ms emulated"
          },
          {
            "name": "store/FireStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 24.379,
            "range": "± 137.523",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=7.619ms max=3290.431ms emulated"
          },
          {
            "name": "store/FireStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 18.694,
            "range": "± 206.877",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=6.132ms max=3294.626ms emulated"
          },
          {
            "name": "store/FireStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 14.393,
            "range": "± 2.035",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.891ms max=20.66ms emulated"
          },
          {
            "name": "store/FireStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 31.179,
            "range": "± 6.584",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=14.451ms max=38.437ms emulated"
          },
          {
            "name": "store/FireStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 208.929,
            "range": "± 37.951",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=91.423ms max=221.118ms emulated"
          },
          {
            "name": "store/FireStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 137.232,
            "range": "± 21.998",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=84.804ms max=137.626ms emulated"
          },
          {
            "name": "store/FireStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 197.657,
            "range": "± 35.384",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=125.501ms max=230.949ms emulated"
          },
          {
            "name": "store/FireStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 58.065,
            "range": "± 8.917",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=35.258ms max=63.177ms emulated"
          },
          {
            "name": "store/FireStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 18.006,
            "range": "± 2.958",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=6.476ms max=22.151ms emulated"
          },
          {
            "name": "store/FireStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 25.1,
            "range": "± 3.398",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=9.56ms max=27.623ms emulated"
          },
          {
            "name": "store/FireStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 19.415,
            "range": "± 2.522",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=5.411ms max=24.592ms emulated"
          },
          {
            "name": "store/FireStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 734.003,
            "range": "± 138.225",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=646.447ms max=734.003ms emulated"
          },
          {
            "name": "store/FireStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 385.352,
            "range": "± 16.668",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=354.943ms max=385.352ms emulated"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.56,
            "range": "± 0.081",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.393ms max=2.216ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.557,
            "range": "± 0.043",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.417ms max=0.966ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.606,
            "range": "± 0.041",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.482ms max=0.904ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.611,
            "range": "± 0.04",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.451ms max=0.837ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.594,
            "range": "± 0.041",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.436ms max=0.665ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.464,
            "range": "± 0.038",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.342ms max=0.752ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.332,
            "range": "± 0.243",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.091ms max=1.544ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.623,
            "range": "± 0.202",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.795ms max=2.679ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.177,
            "range": "± 0.077",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.979ms max=2.202ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.169,
            "range": "± 0.14",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.636ms max=2.609ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 3.492,
            "range": "± 0.271",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=2.072ms max=3.512ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.499,
            "range": "± 0.063",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.339ms max=1.392ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.445,
            "range": "± 0.051",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.312ms max=0.95ms"
          },
          {
            "name": "store/MongoStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 4.008,
            "range": "± 0.661",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.912ms max=5.804ms"
          },
          {
            "name": "store/MongoStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 4.073,
            "range": "± 0.757",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.658ms max=6.504ms"
          },
          {
            "name": "store/MongoStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.912,
            "range": "± 0.808",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.79ms max=6.525ms"
          },
          {
            "name": "store/MongoStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 4.526,
            "range": "± 0.852",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.713ms max=7.352ms"
          },
          {
            "name": "store/MongoStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.564,
            "range": "± 0.725",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.69ms max=4.325ms"
          },
          {
            "name": "store/MongoStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.095,
            "range": "± 0.589",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.364ms max=3.518ms"
          },
          {
            "name": "store/MongoStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 10.396,
            "range": "± 1.897",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.833ms max=10.912ms"
          },
          {
            "name": "store/MongoStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 31.359,
            "range": "± 5.657",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=12.263ms max=32.719ms"
          },
          {
            "name": "store/MongoStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 26.575,
            "range": "± 4.151",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=11.567ms max=26.739ms"
          },
          {
            "name": "store/MongoStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 25.919,
            "range": "± 4.443",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=11.551ms max=26.247ms"
          },
          {
            "name": "store/MongoStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 28.23,
            "range": "± 4.262",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=12.968ms max=28.361ms"
          },
          {
            "name": "store/MongoStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.701,
            "range": "± 0.592",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.679ms max=4.084ms"
          },
          {
            "name": "store/MongoStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.566,
            "range": "± 0.596",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.288ms max=5.169ms"
          },
          {
            "name": "store/MongoStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.855,
            "range": "± 0.576",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.27ms max=4.026ms"
          },
          {
            "name": "store/MongoStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 50.921,
            "range": "± 2.014",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=49.086ms max=50.921ms"
          },
          {
            "name": "store/MongoStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 49.971,
            "range": "± 1.153",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=47.612ms max=49.971ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.52,
            "range": "± 0.099",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.296ms max=2.482ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 3.326,
            "range": "± 0.539",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.433ms max=4.895ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.736,
            "range": "± 0.083",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.407ms max=1.185ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] p99",
            "value": 2.349,
            "range": "± 0.423",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.022ms max=2.673ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=1000,subscribers=1] p99",
            "value": 0.484,
            "range": "± 0.077",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.369ms max=2.15ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.fanout[messages=200,subscribers=5] p99",
            "value": 0.913,
            "range": "± 0.118",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.469ms max=1.382ms"
          },
          {
            "name": "pubsub/PostgresPubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.528,
            "range": "± 0.047",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.391ms max=0.55ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.554,
            "range": "± 0.09",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.4ms max=2.23ms"
          },
          {
            "name": "queue/PostgresQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 4.866,
            "range": "± 1.042",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.692ms max=11.469ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=1,messages=1000] p99",
            "value": 457.179,
            "range": "± 78.53",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=309.068ms max=461.373ms"
          },
          {
            "name": "queue/PostgresQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 242.352,
            "range": "± 30.348",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=192.938ms max=247.857ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 413.139,
            "range": "± 65.634",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=300.417ms max=415.236ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2596.274,
            "range": "± 693.108",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1413.48ms max=2619.343ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 400.818,
            "range": "± 58.641",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=306.708ms max=402.653ms"
          },
          {
            "name": "queue/PostgresQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2587.886,
            "range": "± 700.417",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1414.529ms max=2610.954ms"
          },
          {
            "name": "queue/PostgresQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 2.007,
            "range": "± 0.61",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=1.157ms max=10.994ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.417,
            "range": "± 0.035",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.296ms max=0.526ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.383,
            "range": "± 0.049",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.276ms max=1.416ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.686,
            "range": "± 0.128",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.458ms max=3.346ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.61,
            "range": "± 0.175",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.43ms max=5.378ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.592,
            "range": "± 0.211",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.434ms max=6.869ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.594,
            "range": "± 0.178",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.433ms max=5.669ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.228,
            "range": "± 0.199",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.903ms max=2.707ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.951,
            "range": "± 0.211",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.299ms max=1.972ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.14,
            "range": "± 0.146",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.512ms max=2.294ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.368,
            "range": "± 0.101",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.168ms max=1.835ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.109,
            "range": "± 0.153",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.231ms max=2.14ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.571,
            "range": "± 0.184",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.383ms max=5.734ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.496,
            "range": "± 0.204",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.345ms max=5.96ms"
          },
          {
            "name": "store/PostgresStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.062,
            "range": "± 0.413",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.884ms max=3.224ms"
          },
          {
            "name": "store/PostgresStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 1.9,
            "range": "± 0.357",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.838ms max=2.359ms"
          },
          {
            "name": "store/PostgresStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.992,
            "range": "± 0.482",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.393ms max=4.44ms"
          },
          {
            "name": "store/PostgresStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.415,
            "range": "± 0.363",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.312ms max=2.753ms"
          },
          {
            "name": "store/PostgresStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.261,
            "range": "± 0.369",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.278ms max=3.85ms"
          },
          {
            "name": "store/PostgresStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.37,
            "range": "± 0.355",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.231ms max=2.621ms"
          },
          {
            "name": "store/PostgresStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 5.169,
            "range": "± 0.938",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.771ms max=7.598ms"
          },
          {
            "name": "store/PostgresStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 14.475,
            "range": "± 2.558",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=6.861ms max=14.516ms"
          },
          {
            "name": "store/PostgresStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 17.023,
            "range": "± 2.723",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=8.098ms max=17.99ms"
          },
          {
            "name": "store/PostgresStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 16.531,
            "range": "± 2.799",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=7.782ms max=16.908ms"
          },
          {
            "name": "store/PostgresStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 25.215,
            "range": "± 3.822",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=5.96ms max=26.296ms"
          },
          {
            "name": "store/PostgresStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.216,
            "range": "± 0.37",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.208ms max=2.894ms"
          },
          {
            "name": "store/PostgresStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 2.468,
            "range": "± 1.377",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.972ms max=15.229ms"
          },
          {
            "name": "store/PostgresStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 9.044,
            "range": "± 2.052",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1.692ms max=13.124ms"
          },
          {
            "name": "store/PostgresStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 33.423,
            "range": "± 1.977",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=29.262ms max=33.423ms"
          },
          {
            "name": "store/PostgresStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 33.325,
            "range": "± 0.282",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=32.735ms max=33.325ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=1,subscribers=0] p99",
            "value": 0.108,
            "range": "± 0.166",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.023ms max=3.426ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.publish[concurrency=10,subscribers=0] p99",
            "value": 3.303,
            "range": "± 0.54",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.248ms max=3.897ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.latency[ratePerSec=100,subscribers=1] p99",
            "value": 0.338,
            "range": "± 0.177",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.13ms max=3.131ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.e2e.throughput[messages=1000,publishConcurrency=10,subscribers=1] p99",
            "value": 3.092,
            "range": "± 0.444",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.22ms max=3.666ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=1000,subscribers=1] p99",
            "value": 0.156,
            "range": "± 0.192",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.07ms max=3.482ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.fanout[messages=200,subscribers=5] p99",
            "value": 0.33,
            "range": "± 0.078",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.141ms max=0.927ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=100,subscribers=1] p99",
            "value": 0.635,
            "range": "± 0.257",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.086ms max=2.611ms"
          },
          {
            "name": "pubsub/SQLitePubSub/pubsub.payload[payloadBytes=10240,subscribers=1] p99",
            "value": 0.331,
            "range": "± 0.041",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.125ms max=0.381ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=1,payloadBytes=100] p99",
            "value": 0.084,
            "range": "± 0.179",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.024ms max=3.607ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.send[concurrency=10,payloadBytes=100] p99",
            "value": 3.269,
            "range": "± 0.504",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.237ms max=3.338ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=1,messages=1000] p99",
            "value": 39.682,
            "range": "± 1.646",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=36.536ms max=39.715ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.drain.raw[concurrency=10,messages=1000] p99",
            "value": 39.125,
            "range": "± 1.582",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=35.652ms max=39.682ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 272.368,
            "range": "± 64.254",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=167.379ms max=274.465ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=1,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2125.464,
            "range": "± 608.96",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1097.859ms max=2146.435ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=true] p99",
            "value": 253.1,
            "range": "± 64.207",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=146.276ms max=255.328ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.consume[maxConsumers=10,messages=1000,workMs=2,workerParallelism=false] p99",
            "value": 2155.872,
            "range": "± 619.377",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=1111.491ms max=2176.844ms"
          },
          {
            "name": "queue/SQLiteQueue/queue.e2e.latency[maxConsumers=10,ratePerSec=100] p99",
            "value": 0.382,
            "range": "± 0.271",
            "unit": "ms",
            "extra": "ops=300 errors=0 p50=0.174ms max=3.58ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.08,
            "range": "± 0.274",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.024ms max=8.684ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.039,
            "range": "± 0.006",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.01ms max=0.094ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.127,
            "range": "± 0.108",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.042ms max=3.406ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.091,
            "range": "± 0.092",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.038ms max=2.927ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.074,
            "range": "± 0.098",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.037ms max=3.107ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.083,
            "range": "± 0.107",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.029ms max=3.371ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.161,
            "range": "± 0.159",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.082ms max=3.424ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.793,
            "range": "± 0.191",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.996ms max=1.877ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.507,
            "range": "± 0.135",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.245ms max=2.38ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 1.3,
            "range": "± 0.102",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=0.794ms max=1.346ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 2.824,
            "range": "± 0.217",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=1.71ms max=2.947ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.104,
            "range": "± 0.151",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.035ms max=3.557ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=1,dataset=1000,docSize=small] p99",
            "value": 0.061,
            "range": "± 0.17",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.017ms max=3.252ms"
          },
          {
            "name": "store/SQLiteStore/store.get[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.196,
            "range": "± 0.016",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.134ms max=0.214ms"
          },
          {
            "name": "store/SQLiteStore/store.exists[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.205,
            "range": "± 0.027",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.085ms max=0.217ms"
          },
          {
            "name": "store/SQLiteStore/store.update[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.685,
            "range": "± 0.336",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.345ms max=3.789ms"
          },
          {
            "name": "store/SQLiteStore/store.patch[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.615,
            "range": "± 0.339",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.308ms max=3.754ms"
          },
          {
            "name": "store/SQLiteStore/store.setAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.425,
            "range": "± 0.089",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.291ms max=1.155ms"
          },
          {
            "name": "store/SQLiteStore/store.incrementAttribute[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.607,
            "range": "± 0.484",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.23ms max=3.891ms"
          },
          {
            "name": "store/SQLiteStore/store.upsert[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 1.448,
            "range": "± 0.453",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.758ms max=5.218ms"
          },
          {
            "name": "store/SQLiteStore/store.query.eq[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 8.946,
            "range": "± 0.981",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=7.938ms max=9.47ms"
          },
          {
            "name": "store/SQLiteStore/store.query.range[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 12.493,
            "range": "± 1.163",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=10.756ms max=13.648ms"
          },
          {
            "name": "store/SQLiteStore/store.query.in[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 9.232,
            "range": "± 0.783",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=7.18ms max=10.035ms"
          },
          {
            "name": "store/SQLiteStore/store.query.orderBy[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 22.266,
            "range": "± 2.356",
            "unit": "ms",
            "extra": "ops=100 errors=0 p50=20.218ms max=24.347ms"
          },
          {
            "name": "store/SQLiteStore/store.create[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.707,
            "range": "± 0.606",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.369ms max=4.526ms"
          },
          {
            "name": "store/SQLiteStore/store.delete[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 3.375,
            "range": "± 0.443",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.191ms max=3.416ms"
          },
          {
            "name": "store/SQLiteStore/store.contention.increment[concurrency=10,dataset=1000,docSize=small] p99",
            "value": 0.537,
            "range": "± 0.325",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=0.217ms max=3.547ms"
          },
          {
            "name": "store/SQLiteStore/store.query.paginate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 34.374,
            "range": "± 3.265",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=27.574ms max=34.374ms"
          },
          {
            "name": "store/SQLiteStore/store.iterate[dataset=1000,docSize=small,pageSize=100] p99",
            "value": 30.441,
            "range": "± 0.476",
            "unit": "ms",
            "extra": "ops=3 errors=0 p50=30.278ms max=30.441ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=1,posts=1000] p99",
            "value": 1.307,
            "range": "± 0.37",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.914ms max=5.935ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=1,posts=1000] p99",
            "value": 1.529,
            "range": "± 0.546",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.035ms max=8.618ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=1,posts=1000] p99",
            "value": 1.993,
            "range": "± 0.598",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.335ms max=9.544ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=1,posts=1000] p99",
            "value": 17.629,
            "range": "± 0.692",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=15.188ms max=18.907ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=1,posts=1000] p99",
            "value": 27.263,
            "range": "± 2.287",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=15.917ms max=36.143ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=1,posts=1000] p99",
            "value": 25.346,
            "range": "± 1.894",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=15.008ms max=31.31ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.getPost[concurrency=10,posts=1000] p99",
            "value": 11.084,
            "range": "± 1.278",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=6.373ms max=17.285ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.getPost[concurrency=10,posts=1000] p99",
            "value": 15.761,
            "range": "± 2.63",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=5.341ms max=15.802ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.getPost[concurrency=10,posts=1000] p99",
            "value": 14.303,
            "range": "± 1.075",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=10.199ms max=16.179ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.rest.feed[concurrency=10,posts=1000] p99",
            "value": 167.117,
            "range": "± 5.786",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=146.67ms max=167.117ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.grpc.feed[concurrency=10,posts=1000] p99",
            "value": 262.275,
            "range": "± 35.585",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=138.674ms max=305.922ms"
          },
          {
            "name": "blog/MemoryStore/blog.http.graphql.feed[concurrency=10,posts=1000] p99",
            "value": 181.797,
            "range": "± 19.206",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=148.636ms max=311.427ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5] p99",
            "value": 1119.879,
            "range": "± 13.784",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1092.616ms max=1119.879ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5] p99",
            "value": 25.117,
            "range": "± 0.731",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=24.281ms max=25.117ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5] p99",
            "value": 379.585,
            "range": "± 5.4",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=371.458ms max=379.585ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5] p99",
            "value": 467.403,
            "range": "± 4.775",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=458.228ms max=467.403ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5] p99",
            "value": 230.818,
            "range": "± 19.495",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=193.2ms max=230.818ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5] p99",
            "value": 55.443,
            "range": "± 0.799",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=54.559ms max=55.443ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5] p99",
            "value": 177.603,
            "range": "± 20.164",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=137.757ms max=177.603ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5] p99",
            "value": 42.402,
            "range": "± 0.387",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=41.878ms max=42.402ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5] p99",
            "value": 3.854,
            "range": "± 0.131",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=3.629ms max=3.854ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.total[boots=5,compileCache=true] p99",
            "value": 997.196,
            "range": "± 33.064",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=975.7ms max=997.196ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.nodeStart[boots=5,compileCache=true] p99",
            "value": 30.36,
            "range": "± 2.277",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=24.756ms max=30.36ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.import[boots=5,compileCache=true] p99",
            "value": 303.301,
            "range": "± 1.871",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=300.417ms max=303.301ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.load[boots=5,compileCache=true] p99",
            "value": 378.012,
            "range": "± 3.728",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=369.623ms max=378.012ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.init[boots=5,compileCache=true] p99",
            "value": 256.246,
            "range": "± 33.067",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=243.27ms max=256.246ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.resolve[boots=5,compileCache=true] p99",
            "value": 55.083,
            "range": "± 0.267",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=54.657ms max=55.083ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.servicesInit[boots=5,compileCache=true] p99",
            "value": 201.589,
            "range": "± 32.992",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=188.875ms max=201.589ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.firstRequest[boots=5,compileCache=true] p99",
            "value": 39.289,
            "range": "± 0.517",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=38.765ms max=39.289ms"
          },
          {
            "name": "blog/MemoryStore/blog.coldboot.warmRequest[boots=5,compileCache=true] p99",
            "value": 3.731,
            "range": "± 0.12",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=3.508ms max=3.731ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 19.12,
            "range": "± 0.991",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=14.189ms max=20.529ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 23.642,
            "range": "± 1.794",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=18.874ms max=42.467ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 8.008,
            "range": "± 0.759",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=3.639ms max=10.633ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 9.478,
            "range": "± 0.876",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.387ms max=13.361ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 4.78,
            "range": "± 0.83",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.319ms max=9.88ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 0.561,
            "range": "± 0.043",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.338ms max=0.58ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 0.428,
            "range": "± 0.04",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.269ms max=0.473ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 9.077,
            "range": "± 0.87",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.293ms max=12.886ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 197.788,
            "range": "± 7.372",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=167.379ms max=197.788ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 233.046,
            "range": "± 5.183",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=211.55ms max=233.046ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 43.713,
            "range": "± 2.022",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=36.7ms max=44.335ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 68.616,
            "range": "± 7.333",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=41.157ms max=68.616ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 2.478,
            "range": "± 0.17",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.825ms max=2.54ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 10.306,
            "range": "± 1.905",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=2.195ms max=10.551ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 9.077,
            "range": "± 1.824",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.773ms max=9.29ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 42.959,
            "range": "± 0.792",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=40.698ms max=42.959ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 26.477,
            "range": "± 9.694",
            "unit": "ms",
            "extra": "ops=675 errors=0 p50=19.317ms max=36.372ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 333.447,
            "range": "± 112.98",
            "unit": "ms",
            "extra": "ops=585 errors=0 p50=187.564ms max=350.487ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=1] p99",
            "value": 47.481,
            "range": "± 3.181",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=36.798ms max=47.481ms"
          },
          {
            "name": "blog/MemoryStore/blog.login[concurrency=10] p99",
            "value": 179.569,
            "range": "± 32.401",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=120.652ms max=179.569ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] p99",
            "value": 22.446,
            "range": "± 7.521",
            "unit": "ms",
            "extra": "ops=873 errors=0 p50=14.139ms max=29.59ms"
          },
          {
            "name": "blog/MemoryStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] p99",
            "value": 275.251,
            "range": "± 90.544",
            "unit": "ms",
            "extra": "ops=734 errors=0 p50=131.465ms max=280.232ms"
          },
          {
            "name": "blog/MemoryStore/blog.boot[audit=true,mode=warm] p99",
            "value": 171.835,
            "range": "± 23.135",
            "unit": "ms",
            "extra": "ops=6 errors=0 p50=112.067ms max=171.835ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 5.861,
            "range": "± 0.531",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.272ms max=9.814ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 8.593,
            "range": "± 1.106",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=3.095ms max=9.822ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 3.736,
            "range": "± 0.527",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.797ms max=7.176ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 9.306,
            "range": "± 1.293",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=3.084ms max=10.813ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 3.009,
            "range": "± 0.571",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.932ms max=6.824ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 1.257,
            "range": "± 0.103",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.966ms max=2.079ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 2.533,
            "range": "± 0.544",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.864ms max=6.164ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 9.339,
            "range": "± 1.022",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=3.738ms max=11.731ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 78.512,
            "range": "± 13.659",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=20.873ms max=82.838ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 39.289,
            "range": "± 6.846",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=16.81ms max=48.824ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 21.676,
            "range": "± 3.292",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=9.429ms max=23.216ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 44.859,
            "range": "± 6.724",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=16.163ms max=52.33ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 23.282,
            "range": "± 8.179",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=7.131ms max=80.544ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 18.268,
            "range": "± 7.913",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=6.894ms max=80.937ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 26.919,
            "range": "± 7.853",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=8.233ms max=79.626ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 50.43,
            "range": "± 7.203",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=19.202ms max=57.082ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 10.641,
            "range": "± 2.033",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=4.067ms max=16.523ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 45.842,
            "range": "± 8.784",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=17.22ms max=68.944ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=1] p99",
            "value": 47.841,
            "range": "± 2.79",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=39.42ms max=47.841ms"
          },
          {
            "name": "blog/MongoStore/blog.login[concurrency=10] p99",
            "value": 181.142,
            "range": "± 32.056",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=138.805ms max=181.142ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] p99",
            "value": 4.551,
            "range": "± 1.284",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.968ms max=6.914ms"
          },
          {
            "name": "blog/MongoStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] p99",
            "value": 36.143,
            "range": "± 7.36",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=14.696ms max=48.136ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5] p99",
            "value": 1222.64,
            "range": "± 15.688",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1186.988ms max=1222.64ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5] p99",
            "value": 24.527,
            "range": "± 0.192",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=24.297ms max=24.527ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5] p99",
            "value": 391.643,
            "range": "± 9.433",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=369.623ms max=391.643ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5] p99",
            "value": 542.638,
            "range": "± 7.472",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=529.007ms max=542.638ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5] p99",
            "value": 221.512,
            "range": "± 1.43",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=218.497ms max=221.512ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5] p99",
            "value": 52.986,
            "range": "± 0.735",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=52.265ms max=52.986ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5] p99",
            "value": 168.952,
            "range": "± 1.382",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=167.51ms max=168.952ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5] p99",
            "value": 47.94,
            "range": "± 0.687",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=46.334ms max=47.94ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5] p99",
            "value": 11.469,
            "range": "± 0.925",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=9.29ms max=11.469ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.total[boots=5,compileCache=true] p99",
            "value": 1018.167,
            "range": "± 6.535",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1008.206ms max=1018.167ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.nodeStart[boots=5,compileCache=true] p99",
            "value": 25.346,
            "range": "± 0.875",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=23.953ms max=25.346ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.import[boots=5,compileCache=true] p99",
            "value": 305.398,
            "range": "± 3.815",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=300.679ms max=305.398ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.load[boots=5,compileCache=true] p99",
            "value": 434.373,
            "range": "± 6.859",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=419.955ms max=434.373ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.init[boots=5,compileCache=true] p99",
            "value": 224.264,
            "range": "± 2.614",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=218.628ms max=224.264ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.resolve[boots=5,compileCache=true] p99",
            "value": 53.641,
            "range": "± 0.63",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=52.953ms max=53.641ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.servicesInit[boots=5,compileCache=true] p99",
            "value": 171.311,
            "range": "± 2.352",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=165.806ms max=171.311ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.firstRequest[boots=5,compileCache=true] p99",
            "value": 45.744,
            "range": "± 1.32",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=42.566ms max=45.744ms"
          },
          {
            "name": "blog/MongoStore/blog.coldboot.warmRequest[boots=5,compileCache=true] p99",
            "value": 9.56,
            "range": "± 0.376",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=8.864ms max=9.56ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=1,posts=1000] p99",
            "value": 1.891,
            "range": "± 0.288",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.325ms max=4.973ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=1,posts=1000] p99",
            "value": 4.735,
            "range": "± 0.699",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.497ms max=7.877ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=1,posts=1000] p99",
            "value": 2.501,
            "range": "± 0.524",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.746ms max=8.102ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=1,posts=1000] p99",
            "value": 7.201,
            "range": "± 0.512",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.977ms max=8.774ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=1,posts=1000] p99",
            "value": 11.575,
            "range": "± 1.318",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.944ms max=16.13ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=1,posts=1000] p99",
            "value": 6.762,
            "range": "± 0.413",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.923ms max=7.926ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.getPost[concurrency=10,posts=1000] p99",
            "value": 16.204,
            "range": "± 1.737",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=9.019ms max=19.12ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.getPost[concurrency=10,posts=1000] p99",
            "value": 13.828,
            "range": "± 1.779",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=8.253ms max=15.09ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.getPost[concurrency=10,posts=1000] p99",
            "value": 17.531,
            "range": "± 1.413",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=12.755ms max=18.317ms"
          },
          {
            "name": "blog/MongoStore/blog.http.rest.feed[concurrency=10,posts=1000] p99",
            "value": 36.209,
            "range": "± 3.259",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=27.443ms max=37.388ms"
          },
          {
            "name": "blog/MongoStore/blog.http.grpc.feed[concurrency=10,posts=1000] p99",
            "value": 70.386,
            "range": "± 10.092",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=26.313ms max=70.386ms"
          },
          {
            "name": "blog/MongoStore/blog.http.graphql.feed[concurrency=10,posts=1000] p99",
            "value": 39.617,
            "range": "± 4.174",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=27.427ms max=42.107ms"
          },
          {
            "name": "blog/MongoStore/blog.boot[audit=true,mode=warm] p99",
            "value": 121.176,
            "range": "± 9.981",
            "unit": "ms",
            "extra": "ops=6 errors=0 p50=101.45ms max=121.176ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 5.48,
            "range": "± 0.437",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=3.523ms max=6.316ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 6.5,
            "range": "± 0.978",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=2.521ms max=9.232ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 4.579,
            "range": "± 0.915",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.452ms max=10.232ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 7.062,
            "range": "± 1.109",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=2.243ms max=7.713ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 2.966,
            "range": "± 0.56",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.807ms max=6.513ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 4.297,
            "range": "± 0.574",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.818ms max=5.8ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 2.781,
            "range": "± 0.532",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=0.715ms max=6.455ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 12.485,
            "range": "± 1.522",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=2.869ms max=14.402ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.feed[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 51.446,
            "range": "± 8.783",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=16.048ms max=55.345ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.readPost[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 33.227,
            "range": "± 6.606",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=14.057ms max=38.797ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.tagPage[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 18.874,
            "range": "± 2.966",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=8.511ms max=21.201ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.profile[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 39.158,
            "range": "± 6.434",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=11.248ms max=47.546ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.comment[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 18.563,
            "range": "± 2.995",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=5.886ms max=18.825ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.draft[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 16.613,
            "range": "± 2.561",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=6.386ms max=18.072ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.publish[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 7.913,
            "range": "± 0.879",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=5.542ms max=8.716ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.follow[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 20.546,
            "range": "± 2.313",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=13.197ms max=23.429ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=1,posts=1000,users=100] p99",
            "value": 10.895,
            "range": "± 1.816",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.941ms max=13.902ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=true,concurrency=10,posts=1000,users=100] p99",
            "value": 33.98,
            "range": "± 6.563",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=12.993ms max=56.525ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=1] p99",
            "value": 45.875,
            "range": "± 2.512",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=38.404ms max=45.875ms"
          },
          {
            "name": "blog/PostgresStore/blog.login[concurrency=10] p99",
            "value": 186.909,
            "range": "± 37.531",
            "unit": "ms",
            "extra": "ops=20 errors=0 p50=121.111ms max=186.909ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=1,posts=1000,users=100] p99",
            "value": 8.348,
            "range": "± 1.472",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=2.384ms max=14.139ms"
          },
          {
            "name": "blog/PostgresStore/blog.domain.mix[audit=false,concurrency=10,posts=1000,users=100] p99",
            "value": 25.297,
            "range": "± 4.975",
            "unit": "ms",
            "extra": "ops=1000 errors=0 p50=11.092ms max=31.949ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=1,posts=1000] p99",
            "value": 1.71,
            "range": "± 0.277",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.251ms max=4.727ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=1,posts=1000] p99",
            "value": 1.931,
            "range": "± 0.431",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.374ms max=6.521ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=1,posts=1000] p99",
            "value": 2.259,
            "range": "± 0.435",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=1.651ms max=7.487ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=1,posts=1000] p99",
            "value": 7.004,
            "range": "± 0.551",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.223ms max=7.995ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=1,posts=1000] p99",
            "value": 10.633,
            "range": "± 1.404",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.151ms max=13.296ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=1,posts=1000] p99",
            "value": 9.077,
            "range": "± 0.931",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=4.239ms max=10.879ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.getPost[concurrency=10,posts=1000] p99",
            "value": 15.385,
            "range": "± 1.79",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=7.954ms max=16.351ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.getPost[concurrency=10,posts=1000] p99",
            "value": 14.696,
            "range": "± 1.864",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=7.463ms max=16.99ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.getPost[concurrency=10,posts=1000] p99",
            "value": 18.514,
            "range": "± 1.901",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=12.001ms max=19.808ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.rest.feed[concurrency=10,posts=1000] p99",
            "value": 27.705,
            "range": "± 2.562",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=22.954ms max=29.147ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.grpc.feed[concurrency=10,posts=1000] p99",
            "value": 46.268,
            "range": "± 6.736",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=23.02ms max=46.596ms"
          },
          {
            "name": "blog/PostgresStore/blog.http.graphql.feed[concurrency=10,posts=1000] p99",
            "value": 47.677,
            "range": "± 6.028",
            "unit": "ms",
            "extra": "ops=200 errors=0 p50=25.444ms max=50.397ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5] p99",
            "value": 1146.094,
            "range": "± 5.445",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=1142.948ms max=1146.094ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5] p99",
            "value": 27.705,
            "range": "± 1.133",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=25.608ms max=27.705ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5] p99",
            "value": 374.866,
            "range": "± 1.992",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=370.672ms max=374.866ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5] p99",
            "value": 496.501,
            "range": "± 3.554",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=492.044ms max=496.501ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5] p99",
            "value": 209.191,
            "range": "± 4.002",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=204.866ms max=209.191ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5] p99",
            "value": 51.446,
            "range": "± 0.53",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=50.627ms max=51.446ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5] p99",
            "value": 157.811,
            "range": "± 3.524",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=154.272ms max=157.811ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5] p99",
            "value": 55.411,
            "range": "± 4.309",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=44.696ms max=55.411ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5] p99",
            "value": 7.59,
            "range": "± 0.346",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=7.131ms max=7.59ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.total[boots=5,compileCache=true] p99",
            "value": 1000.342,
            "range": "± 12.022",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=974.127ms max=1000.342ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.nodeStart[boots=5,compileCache=true] p99",
            "value": 27.935,
            "range": "± 1.579",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=24.723ms max=27.935ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.import[boots=5,compileCache=true] p99",
            "value": 306.708,
            "range": "± 3.876",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=300.155ms max=306.708ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.load[boots=5,compileCache=true] p99",
            "value": 422.052,
            "range": "± 9.041",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=402.653ms max=422.052ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.init[boots=5,compileCache=true] p99",
            "value": 207.225,
            "range": "± 1.398",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=205.783ms max=207.225ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.resolve[boots=5,compileCache=true] p99",
            "value": 51.773,
            "range": "± 0.439",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=50.954ms max=51.773ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.servicesInit[boots=5,compileCache=true] p99",
            "value": 156.238,
            "range": "± 1.75",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=155.451ms max=156.238ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.firstRequest[boots=5,compileCache=true] p99",
            "value": 43.745,
            "range": "± 0.907",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=41.681ms max=43.745ms"
          },
          {
            "name": "blog/PostgresStore/blog.coldboot.warmRequest[boots=5,compileCache=true] p99",
            "value": 7.639,
            "range": "± 0.458",
            "unit": "ms",
            "extra": "ops=5 errors=0 p50=7.041ms max=7.639ms"
          },
          {
            "name": "blog/PostgresStore/blog.boot[audit=true,mode=warm] p99",
            "value": 132.055,
            "range": "± 11.505",
            "unit": "ms",
            "extra": "ops=6 errors=0 p50=102.957ms max=132.055ms"
          }
        ]
      }
    ]
  }
}