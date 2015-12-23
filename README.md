# gq2-redis

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
$ node gq2redis.js &
$ node --max_old_space_size=8000000 redistribute.js &
```

### client:

```bash
$ node cli &
```

