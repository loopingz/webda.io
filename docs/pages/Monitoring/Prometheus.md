# Prometheus

Within your service you can use the `getMetric` method to get a metric object.

## Enable the prometheus collector

Add this to your `webda.config.json`

```js title="webda.config.json"
{
    ...
    "services": {
        ...
        "PrometheusService": {
            "portNumber": 9090
        }
        ...
    }
}
```
