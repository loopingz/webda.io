# Async Actions

This module allows you to execute and give status on jobs

## Architecture

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
	Ar->>O: Run action
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

## Runner


## Job

### Node

### Python

```python

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
    r = requests.post(
        environ.get("JOB_HOOK") + "/status", json=data, headers=job_headers()
    )
    return r.json()


def download_from(
    store: string, uuid: string, property: string, index: int, dirpath: string
):
    """
    Download a file related to the Job
    """
    # Get the download link from the service
    r = requests.get(
        "{hook}/download/{store}/{uuid}/{property}/{index}".format(
            hook=environ.get("JOB_HOOK"),
            store=store,
            uuid=uuid,
            property=property,
            index=index,
        ),
        headers=job_headers(),
    )
    if r.status_code != 200:
        raise Exception("Cannot download")
    res = r.json()
    filename = path.join(dirpath, res["Map"]["hash"])
    if path.exists(filename):
        print("Already downloaded")
        return
    dwl = requests.get(res["Location"])
    if r.status_code != 200:
        raise Exception("Cannot download from redirect")
    with open(path.join(dirpath, res["Map"]["hash"]), "wb") as f:
        f.write(dwl.content)
    return filename


def upload_to(
    store: string, uuid: string, property: string, filepath: string, metadata={}
):
    """
    Upload a file related to the Job
    """
    file_hash = hashlib.md5()
    challenge = hashlib.md5()
    challenge.update("WEBDA".encode())
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            file_hash.update(chunk)
            challenge.update(chunk)
    # Get the upload link from the service
    r = requests.put(
        "{hook}/upload/{store}/{uuid}/{property}".format(
            hook=environ.get("JOB_HOOK"),
            store=store,
            uuid=uuid,
            property=property,
        ),
        json={
            "hash": file_hash.hexdigest(),
            "challenge": challenge.hexdigest(),
            "metadata": metadata,
        },
        headers=job_headers(),
    )
    if r.status_code != 200:
        raise Exception("Upload failed")
    res = r.json()
    # If file is already known to the system
    if res["done"]:
        print("Already uploaded")
        return
    with open(filepath, "rb") as f:
        res = requests.request(res["method"], res["url"], data=f)
        if res.status_code >= 300:
            raise Exception("Upload failed")

```