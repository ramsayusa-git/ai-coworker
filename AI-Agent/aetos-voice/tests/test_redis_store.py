import fakeredis.aioredis
import pytest

from app.core.redis_store import RedisStore


@pytest.fixture
def store():
    s = RedisStore("redis://unused", prefix="app")
    s._client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    return s


async def test_namespacing(store):
    await store.set_json("agents_meta", {"count": 0})
    assert await store.client.exists("app:agents_meta") == 1
    assert await store.get_json("agents_meta") == {"count": 0}


async def test_hash_helpers(store):
    await store.hset_json("agents", "a1", {"name": "Receptionist"})
    await store.hset_json("agents", "a2", {"name": "Support"})
    assert (await store.hget_json("agents", "a1"))["name"] == "Receptionist"
    assert set(await store.hall_json("agents")) == {"a1", "a2"}
    await store.hdel("agents", "a1")
    assert await store.hget_json("agents", "a1") is None


async def test_key_count_only_counts_namespace(store):
    await store.set_json("one", 1)
    await store.client.set("other:key", "x")
    assert await store.key_count() == 1


async def test_ttl_cache(store):
    calls = {"n": 0}

    async def producer():
        calls["n"] += 1
        return {"value": calls["n"]}

    first = await store.cached("expensive", ttl=60, producer=producer)
    second = await store.cached("expensive", ttl=60, producer=producer)
    assert first == second == {"value": 1}
    assert calls["n"] == 1
    ttl = await store.client.ttl("app:cache:expensive")
    assert 0 < ttl <= 60
    refreshed = await store.cached("expensive", ttl=60, producer=producer, refresh=True)
    assert refreshed == {"value": 2}
