async function test() {
  console.log('Testing Ollama connection...');
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:latest',
        prompt: 'Return JSON: {"test": "successful"}',
        stream: false,
        format: 'json'
      })
    });
    const data = await res.json();
    console.log('OLLAMA GENERATION RESULT:', data.response);
  } catch (err) {
    console.error('OLLAMA ERROR:', err.message);
  }
}
test();
