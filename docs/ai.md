# On-Device AI Pipeline Specification

## Models & Runtimes

| Component | Responsibility | Technology | Mobile Footprint |
|---|---|---|---|
| Speech-to-Text | Hindi/Hinglish speech to text | `collabora/whisper-tiny-hindi` | On-device, 16kHz mono |
| Structured Extraction | Transcript to structured JSON | `Cactus Needle 2` | 45M parameters (~14MB binary) |
| Clinical Summarizer | Simple Hindi patient explanation | `Qwen3-1.7B` (Quantized Q4) | Multilingual instruction, non-thinking mode |
| Engine Runtime | Mobile C++ Inference Bindings | `Cactus v2.2.2` Native Driver | Android/iOS development build |
| Resilient Simulator | Offline demo fixtures & speech parser | `OfflineSimulatorDriver` | Zero cloud dependency, instant testing |

## Pipeline Flow

```text
Audio (16kHz PCM)
      ↓
Whisper Tiny Hindi (transcribe)
      ↓
Hindi Transcript
      ↓
Needle 2 (extractScreeningData)
      ↓
Structured JSON
      ↓
Validation Layer (validateScreeningData)
      ↓
Deterministic Rules (evaluateRules)
      ↓
Qwen3-1.7B (generateSummary)
      ↓
Human Review & Confirmation
      ↓
SQLite + Sync Queue
```
