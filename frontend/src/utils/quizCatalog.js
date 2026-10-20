import { Cpu } from "lucide-react";

export const normalizeQuizzes = (data, { techIconMap, colorSchemes }) => {
  const formatted = {};
  const techList = [];

  const schemeFor = (techId) =>
    colorSchemes?.technologies?.[techId] || colorSchemes?.technologies?.default;

  (data.quizzes || []).forEach((q) => {
    const tech = q.technology?.toLowerCase();
    const level = q.level;

    if (!formatted[tech]) {
      formatted[tech] = {};

      const IconComponent = techIconMap[tech?.toLowerCase()] || Cpu;

      const formatTechName = (name) =>
        name.charAt(0).toUpperCase() + name.slice(1);

      techList.push({
        id: tech,
        name: formatTechName(q.technology),
        color: schemeFor(tech)?.color || "",
        icon: IconComponent,
      });
    }

    formatted[tech][level] = {
      quizId: q._id,
      // Take only what it takes to render the quiz; correctness lives
      // server-side and arrives in the submission review afterwards.
      questions: q.questions.map((question) => ({
        _id: question._id,
        question: question.question,
        options: question.options,
      })),
      timeLimit: q.timeLimit,
    };
  });

  return { questionsData: formatted, techList: techList.reverse() };
};
