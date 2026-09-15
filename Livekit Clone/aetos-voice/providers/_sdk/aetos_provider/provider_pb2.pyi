from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AudioFrame(_message.Message):
    __slots__ = ("pcm16", "sample_rate", "channels", "ts_ms")
    PCM16_FIELD_NUMBER: _ClassVar[int]
    SAMPLE_RATE_FIELD_NUMBER: _ClassVar[int]
    CHANNELS_FIELD_NUMBER: _ClassVar[int]
    TS_MS_FIELD_NUMBER: _ClassVar[int]
    pcm16: bytes
    sample_rate: int
    channels: int
    ts_ms: int
    def __init__(self, pcm16: _Optional[bytes] = ..., sample_rate: _Optional[int] = ..., channels: _Optional[int] = ..., ts_ms: _Optional[int] = ...) -> None: ...

class SttConfig(_message.Message):
    __slots__ = ("language", "model", "sample_rate", "interim", "options")
    class OptionsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    LANGUAGE_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    SAMPLE_RATE_FIELD_NUMBER: _ClassVar[int]
    INTERIM_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    language: str
    model: str
    sample_rate: int
    interim: bool
    options: _containers.ScalarMap[str, str]
    def __init__(self, language: _Optional[str] = ..., model: _Optional[str] = ..., sample_rate: _Optional[int] = ..., interim: _Optional[bool] = ..., options: _Optional[_Mapping[str, str]] = ...) -> None: ...

class SttRequest(_message.Message):
    __slots__ = ("config", "frame", "flush")
    CONFIG_FIELD_NUMBER: _ClassVar[int]
    FRAME_FIELD_NUMBER: _ClassVar[int]
    FLUSH_FIELD_NUMBER: _ClassVar[int]
    config: SttConfig
    frame: AudioFrame
    flush: bool
    def __init__(self, config: _Optional[_Union[SttConfig, _Mapping]] = ..., frame: _Optional[_Union[AudioFrame, _Mapping]] = ..., flush: _Optional[bool] = ...) -> None: ...

class SttEvent(_message.Message):
    __slots__ = ("kind", "text", "confidence", "language", "ts_ms", "error")
    class Kind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        INTERIM: _ClassVar[SttEvent.Kind]
        FINAL: _ClassVar[SttEvent.Kind]
        END_OF_TURN: _ClassVar[SttEvent.Kind]
        ERROR: _ClassVar[SttEvent.Kind]
    INTERIM: SttEvent.Kind
    FINAL: SttEvent.Kind
    END_OF_TURN: SttEvent.Kind
    ERROR: SttEvent.Kind
    KIND_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    LANGUAGE_FIELD_NUMBER: _ClassVar[int]
    TS_MS_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    kind: SttEvent.Kind
    text: str
    confidence: float
    language: str
    ts_ms: int
    error: str
    def __init__(self, kind: _Optional[_Union[SttEvent.Kind, str]] = ..., text: _Optional[str] = ..., confidence: _Optional[float] = ..., language: _Optional[str] = ..., ts_ms: _Optional[int] = ..., error: _Optional[str] = ...) -> None: ...

class TtsConfig(_message.Message):
    __slots__ = ("voice", "model", "sample_rate", "speed", "options")
    class OptionsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    VOICE_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    SAMPLE_RATE_FIELD_NUMBER: _ClassVar[int]
    SPEED_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    voice: str
    model: str
    sample_rate: int
    speed: float
    options: _containers.ScalarMap[str, str]
    def __init__(self, voice: _Optional[str] = ..., model: _Optional[str] = ..., sample_rate: _Optional[int] = ..., speed: _Optional[float] = ..., options: _Optional[_Mapping[str, str]] = ...) -> None: ...

class TtsRequest(_message.Message):
    __slots__ = ("config", "text", "flush")
    CONFIG_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    FLUSH_FIELD_NUMBER: _ClassVar[int]
    config: TtsConfig
    text: str
    flush: bool
    def __init__(self, config: _Optional[_Union[TtsConfig, _Mapping]] = ..., text: _Optional[str] = ..., flush: _Optional[bool] = ...) -> None: ...

class Empty(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthStatus(_message.Message):
    __slots__ = ("state", "detail")
    class State(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        READY: _ClassVar[HealthStatus.State]
        DEGRADED: _ClassVar[HealthStatus.State]
        DOWN: _ClassVar[HealthStatus.State]
        LOADING: _ClassVar[HealthStatus.State]
    READY: HealthStatus.State
    DEGRADED: HealthStatus.State
    DOWN: HealthStatus.State
    LOADING: HealthStatus.State
    STATE_FIELD_NUMBER: _ClassVar[int]
    DETAIL_FIELD_NUMBER: _ClassVar[int]
    state: HealthStatus.State
    detail: str
    def __init__(self, state: _Optional[_Union[HealthStatus.State, str]] = ..., detail: _Optional[str] = ...) -> None: ...

class Caps(_message.Message):
    __slots__ = ("languages", "voices", "sample_rates", "streaming", "extra")
    class ExtraEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    LANGUAGES_FIELD_NUMBER: _ClassVar[int]
    VOICES_FIELD_NUMBER: _ClassVar[int]
    SAMPLE_RATES_FIELD_NUMBER: _ClassVar[int]
    STREAMING_FIELD_NUMBER: _ClassVar[int]
    EXTRA_FIELD_NUMBER: _ClassVar[int]
    languages: _containers.RepeatedScalarFieldContainer[str]
    voices: _containers.RepeatedScalarFieldContainer[str]
    sample_rates: _containers.RepeatedScalarFieldContainer[int]
    streaming: bool
    extra: _containers.ScalarMap[str, str]
    def __init__(self, languages: _Optional[_Iterable[str]] = ..., voices: _Optional[_Iterable[str]] = ..., sample_rates: _Optional[_Iterable[int]] = ..., streaming: _Optional[bool] = ..., extra: _Optional[_Mapping[str, str]] = ...) -> None: ...

class VersionInfo(_message.Message):
    __slots__ = ("name", "version", "sdk", "model", "contracts")
    NAME_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    SDK_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    CONTRACTS_FIELD_NUMBER: _ClassVar[int]
    name: str
    version: str
    sdk: str
    model: str
    contracts: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, name: _Optional[str] = ..., version: _Optional[str] = ..., sdk: _Optional[str] = ..., model: _Optional[str] = ..., contracts: _Optional[_Iterable[int]] = ...) -> None: ...
