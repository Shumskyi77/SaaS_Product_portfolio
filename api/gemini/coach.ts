import { generateGeminiContentWithFallback } from '../../lib/geminiBackend.js';

export default async function handler(req: any, res: any) {
  // CORS: do NOT set credentials — with Origin '*' the browser rejects the response.
  // The client goes same-origin, no credentials needed.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: any = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    body = {};
  }
  const { userMessage, history, userProfile, dailySummary } = body;

  try {
    const systemPrompt = `You are an erudite, certified AI Coach-Nutritionist for the NutriMint app (a Foodvisor analogue).
Your task is to give personal recommendations to the user, referencing their REAL physiological profile and REAL diary nutrition data for today.

User profile:
- Name: ${userProfile?.name || 'Friend'}
- Height: ${userProfile?.height || 175} cm, Age: ${userProfile?.age || 25} years, Gender: ${userProfile?.gender || 'not specified'}
- Current weight: ${userProfile?.currentWeight || 70} kg, Target weight: ${userProfile?.targetWeight || 65} kg
- Daily calorie goal (base): ${userProfile?.targetCalories || 2000} kcal
- Daily macro goals: Protein ${userProfile?.targetProtein || 140}g, Fat ${userProfile?.targetFat || 60}g, Carbs ${userProfile?.targetCarbs || 220}g
- Water norm: ${userProfile?.targetWater || 2000} ml

Today's diary data:
- Total calories eaten: ${dailySummary?.totalCalories || 0} kcal
- Burned in workouts: +${dailySummary?.totalBurned || 0} kcal
- Effective calorie limit (Base + Workouts): ${dailySummary?.effectiveTarget || userProfile?.targetCalories || 2000} kcal
- Active workouts today: ${dailySummary?.workoutListString || 'No workout entries for today yet'}
- Important rule: When workouts are added the effective limit increases, and when workouts are deleted the effective limit automatically decreases.
- Actual macros: Protein ${dailySummary?.totalProtein || 0}g, Fat ${dailySummary?.totalFat || 0}g, Carbs ${dailySummary?.totalCarbs || 0}g
- Today's dish entries: ${dailySummary?.mealListString || 'No entries for today yet'}
- Water drunk: ${dailySummary?.waterIntake || 0} ml

Conversation history (context):
${(history || [])
  .map((h: any) => `${h.role === 'user' ? 'User' : 'Nutritionist'}: ${h.content}`)
  .join('\n')}

New user message: "${userMessage}"

Instructions:
- Reply politely, kindly, professionally and to the point in English.
- Use emoji (🥗, 🥑, 💪, 🔥, 💧) for emphasis.
- Actively use concrete numbers and dishes from the user's diary when they ask about calories, diet, dinner, advice or progress.
- Give practical and actionable nutrition and workout advice.
- Answer length: 1-3 short paragraphs or a concise structured list.`;

    const response = await generateGeminiContentWithFallback(systemPrompt);
    return res.status(200).json({ reply: response.text || 'Great question! I am ready to help you plan your diet.' });
  } catch (error) {
    console.warn('Vercel API Coach fallback:', error);
    const name = userProfile?.name || 'Friend';
    const eaten = dailySummary?.totalCalories || 0;
    const target = dailySummary?.effectiveTarget || userProfile?.targetCalories || 2000;
    const remaining = Math.max(0, target - eaten);
    const burned = dailySummary?.totalBurned || 0;
    const protein = dailySummary?.totalProtein || 0;
    const targetProtein = userProfile?.targetProtein || 140;

    let fallbackReply = `Hello, ${name}! 🥗\n\n`;
    const q = (userMessage || '').toLowerCase();

    if (q.includes('calor') || q.includes('norm') || q.includes('limit') || q.includes('how much') || q.includes('how many')) {
      fallbackReply += `📊 **Today's nutrition status:**\n• Eaten: **${eaten} kcal** of **${target} kcal** (remaining: **${remaining} kcal**).\n• Burned through activity: **+${burned} kcal**.\n• Protein: **${protein}g** / ${targetProtein}g.\n\n`;
      if (remaining > 350) {
        fallbackReply += `💡 *Recommendation:* You have a great calorie buffer! For your next meal, a portion of lean protein (chicken breast, fish or cottage cheese) with vegetables and complex carbs would be perfect.`;
      } else if (remaining > 0) {
        fallbackReply += `💡 *Recommendation:* You are almost at your daily norm. If you feel like a snack — pick a light protein snack or fresh vegetables.`;
      } else {
        fallbackReply += `💡 *Recommendation:* You have hit your calorie norm for today. Remember to drink clean water and keep the balance! 💧`;
      }
    } else if (q.includes('dinner') || q.includes('lunch') || q.includes('breakfast') || q.includes('what to eat') || q.includes('eat') || q.includes('meal')) {
      fallbackReply += `🍽️ **Meal recommendation:**\nFor a perfect balance I recommend:\n1. **Protein:** Salmon steak or roasted turkey breast (150-180g).\n2. **Fiber:** Fresh vegetable salad with a spoon of olive oil (200g).\n3. **Complex carbs:** Quinoa, brown rice or buckwheat (100g).\n\nYour remaining allowance: **${remaining} kcal**. The dish will fit your daily diet perfectly! ✨`;
    } else if (q.includes('run') || q.includes('workout') || q.includes('train') || q.includes('muscle') || q.includes('sport') || q.includes('exercise') || q.includes('gym')) {
      fallbackReply += `💪 **Activity and recovery tip:**\n• Regular workouts speed up metabolism and burn calories (already burned +${burned} kcal today).\n• To preserve muscle, aim for the protein norm (~1.6-2.0g per kg of weight).\n• Be sure to drink water before and after exercise! 💧`;
    } else {
      fallbackReply += `I have analyzed your food diary for today:\n• Eaten: **${eaten} / ${target} kcal** (remaining: **${remaining} kcal**)\n• Protein: **${protein}g** of **${targetProtein}g**\n• Water: **${dailySummary?.waterIntake || 0} ml**\n\nHow can I help? I can suggest a balanced dish recipe, break down macros or build a workout plan! 🥑`;
    }

    return res.status(200).json({ reply: fallbackReply });
  }
}
