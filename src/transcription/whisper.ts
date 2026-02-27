/**
 * Transcrit un fichier audio via l'API OpenAI Whisper.
 * @param audioUrl URL publique du fichier audio (depuis Telegram)
 * @param apiKey Clé API OpenAI
 * @returns Texte transcrit
 */
export async function transcribeAudio(audioUrl: string, apiKey: string): Promise<string> {
  // Télécharge le fichier audio depuis Telegram
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Téléchargement audio échoué: ${audioRes.status}`);
  }
  const audioBuffer = await audioRes.arrayBuffer();

  // Prépare le formulaire multipart pour Whisper
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/ogg' }),
    'voice.ogg'
  );
  formData.append('model', 'whisper-1');
  formData.append('language', 'fr');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { text: string };
  return json.text.trim();
}
