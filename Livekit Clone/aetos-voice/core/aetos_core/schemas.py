from pydantic import BaseModel, Field
from typing import Optional
class Pipeline(BaseModel):
    stt: str = "stt-mock"; llm: str = "fast"; tts: str = "tts-mock"; voice: str = ""; language: str = "en"
class AgentIn(BaseModel):
    name: str; kind: str = "voice"; prompt: str = ""; pipeline: Pipeline = Pipeline(); tools: list[str] = []; kb: list[str] = []
class AgentPatch(BaseModel):
    name: Optional[str]=None; prompt: Optional[str]=None; pipeline: Optional[Pipeline]=None; status: Optional[str]=None
    tools: Optional[list[str]]=None; kb: Optional[list[str]]=None
class SessionStart(BaseModel):
    agent_id: str; channel: str = "sip"; caller: str = ""
class Turn(BaseModel):
    who: str; text: str; ts: float = 0; eot_ms: int = 0; stt_ms: int = 0; llm_ms: int = 0; tts_ms: int = 0
class SessionEnd(BaseModel):
    outcome: str = "completed"; cost: float = 0; summary: str = ""
class TrunkIn(BaseModel): name: str; carrier: str; direction: str; address: str = ""
class NumberIn(BaseModel): e164: str; region: str = ""; direction: str = "both"; trunk_id: Optional[str]=None
class RuleIn(BaseModel): name: str; number: str; agent_id: str; schedule: str = "always"; priority: int = 100
