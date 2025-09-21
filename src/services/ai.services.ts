import groq from "../lib/groq";

export async function AITEST(message:string) {
  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
    response_format: {
    type: 'json_object'
  },
    n:1,
  });
  console.log(completion.choices[0]?.message?.content);
}
