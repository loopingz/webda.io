window.BENCHMARK_DATA = {
  "lastUpdate": 1794541400265,
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
      }
    ]
  }
}