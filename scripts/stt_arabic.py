import json
import sys
import speech_recognition as sr


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Tiada laluan fail audio diberikan."}, ensure_ascii=False))
        sys.exit(1)

    wav_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "ar-SA"

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)

        text = recognizer.recognize_google(audio_data, language=lang)
        print(json.dumps({"ok": True, "text": text}, ensure_ascii=False))
    except sr.UnknownValueError:
        print(json.dumps({"ok": True, "text": ""}, ensure_ascii=False))
    except sr.RequestError as exc:
        print(json.dumps({"ok": False, "error": f"Ralat servis transkripsi: {exc}"}, ensure_ascii=False))
        sys.exit(2)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(3)


if __name__ == "__main__":
    main()
