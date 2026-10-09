# ASHA AI Copilot Architecture

## Philosophy
```text
AI interprets input.
Rules determine workflow.
Humans confirm records.
Database preserves truth.
Sync connects the field to the supervisor.
```

The system separates:
1. **Speech Recognition**: Local Whisper Tiny Hindi STT converts audio into raw Hindi/Hinglish transcripts.
2. **Information Extraction**: Cactus Needle 2 extracts structured clinical entities (blood pressure, blood glucose, gestational age, danger signs).
3. **Data Validation**: Enforces numerical plausibility, physiological limits, and biological consistency (e.g. systolic > diastolic, male != pregnant).
4. **Deterministic Protocol Rules**: External protocol configurations (`ncd-demo.json`, `pregnancy-demo.json`) evaluate triage triggers.
5. **AI Explanation & Summary**: Qwen3-1.7B converts validated records into simple, concise Hindi summaries without independent diagnosis.
6. **Human Confirmation**: Community health workers review, edit, and confirm every record before submission.
7. **Offline Persistence**: Written locally to Expo SQLite. Survived restarts without network dependency.
8. **Synchronization Queue**: Idempotent batch push to FastAPI and Supabase PostgreSQL when connectivity is restored.
