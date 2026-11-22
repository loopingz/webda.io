# Async Actions

This module allows you to execute background tasks (called AsyncAction).
An AsyncAction can run as a child process (LocalRunner), a promise (ServiceRunner) or a kubernetes job (KubeRunner of @webda/kubernetes module).

Using child process or kubernetes job allows you to use other languages to implement your AsyncAction.

When promise is used, you need to implement in Typescript of course.

The AsyncJobService will store the information in a Store, launch the AsyncAction passing it the JobInfo that allows the action to update its status.

The AsyncJobService also allow you to schedule the AsyncAction.

With `includeCron` (the default), `webda async scheduler` launches each `@Cron` operation as an AsyncOperationAction
of its operation id, called as the system with the cron input. The action stores a `system` marker, so the runner
(or `webda async run`) calls the operation as the system again after a queue or a store. The crons are scheduled on the
[cluster leader](../core/Cluster.md) only, so each tick launches one action across the replicas, and the action keeps
a trace of the run. To run something else than an operation at a tick, make an operation that launches it.

## Architecture

Flow with a Queue

```mermaid
sequenceDiagram
	participant Q as Queue
    participant Aa as AsyncActionService API
    participant S as Store
    participant Ar as AsyncActionService Worker
	participant R as Runner
	participant J as Job
    Aa->>S: Create new action in 'QUEUED' status
	Aa->>Q: Queue action
    Q->>Ar: Retrieve Queue item
	activate Ar
	Ar->>S: Move action to 'STARTING' status
	Ar->>R: Run action
	R->>J: Launch Job
	R->>Ar: Return Runner Job Info
	Ar->>S: Save Runner Job Info
	deactivate Ar
	loop status report
		J->>Aa: Use hook /async/status to report
		activate Aa
		Aa->>S: Update status from report
		deactivate Aa
	end
```

Flow with local run and http hook status

```mermaid
sequenceDiagram
    participant S as Store
    participant Ar as AsyncActionService Worker
	participant R as Runner
	participant J as Job
    Ar->>S: Create new action in 'QUEUED' status
	activate Ar
	Ar->>S: Move action to 'STARTING' status
	Ar->>R: Run action
	R->>J: Launch Job
	R->>Ar: Return Runner Job Info
	Ar->>S: Save Runner Job Info
	deactivate Ar
	loop status report
		J->>Ar: Use hook /async/status to report
		activate Ar
		Ar->>S: Update status from report
		deactivate Ar
	end
```

Flow with local run with WebdaAction only

```mermaid
sequenceDiagram
    participant S as Store
    participant Ar as AsyncActionService Worker
	participant R as Runner
	participant J as Job
    Ar->>S: Create new action in 'QUEUED' status
	activate Ar
	Ar->>S: Move action to 'STARTING' status
	Ar->>R: Run action
	R->>J: Launch Job
	R->>Ar: Return Runner Job Info
	Ar->>S: Save Runner Job Info
	deactivate Ar
	loop status report
		J->>S: Update status direclty in Store
	end
```

## Runner

The runner is the service responsible to launch the action effectively.
It can pick which action it can handle by implementing the method `handleType`

This way you can decide to execute your Python Action with a KubernetesJob configuration and the other with another configuration or a child_process.

### LocalRunner

This runner execute a process locally by using the `child_process`

### ServiceRunner

This runner execute only another service method within the same NodeJS process
It can only be used with AsyncOperationAction

### KubeRunner

This runner launch a Job in a Kubernetes

## Job

### Webda

You can define a Kubernetes Job configuration that run your webda image

```
webda async run
```

It will pick up automatically the job info from the `JOB_*` environment variables (`JOB_ORCHESTRATOR` names the AsyncJobService instance), run the target operation and post its status

### Python

You can interact with the AsyncJobService API with this primitives.

```python title="job.py"

def check_job():
    if (
        environ.get("JOB_ID") is None
        or environ.get("JOB_SECRET_KEY") is None
        or environ.get("JOB_HOOK") is None
    ):
        raise Exception("JOB_ID, JOB_SECRET_KEY and JOB_HOOK are required")


def job_headers():
    ts = str(round(time.time() * 1000))
    return {
        "X-Job-Id": environ.get("JOB_ID"),
        "X-Job-Time": ts,
        "X-Job-Hash": hmac.new(
            bytes(environ.get("JOB_SECRET_KEY"), "latin-1"),
            msg=bytes(ts, "latin-1"),
            digestmod=hashlib.sha256,
        )
        .hexdigest()
        .lower(),
    }


def send_status(data=None):
    """
    Send Job Status
    """
    ts = str(round(time.time() * 1000))
    # https://docs.python.org/3/library/http.client.html
    # JOB_HOOK is the full status hook url ({apiUrl}/async/status)
    r = requests.post(environ.get("JOB_HOOK"), json=data, headers=job_headers())
    return r.json()
```
