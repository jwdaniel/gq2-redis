# gq2-redis

A private stress test on my Node.js pubsub system.

## Prepare

### for ubuntu

```bash
$ npm install --unsafe-perm
```
### gq2.config.json

```
{
	"server": "your-own-gq2-server",
	"port": 443,
	"SSL": true,
	"a": "a",
	"b": "b",
	"c": "c",
	"d": "d"
}
```

## Run

### server:

```bash
$ cat sysctl.txt >> /etc/sysctl.conf
$ sysctl -p
$ node gq2redis.js &
$ node --max_old_space_size=8000000 redistribute.js &
```

### client:

Try the following clients:
```bash
$ ulimit -n 65536
$ node cli &
$ node cli2 &
$ node rtt2 &
```

