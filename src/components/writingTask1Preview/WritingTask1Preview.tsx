interface Task1 {
  image: string;
  report: string;
}

interface Props {
  task1: Task1;
}

export default function WritingTask1Preview({ task1 }: Props) {
  return (
    <div className="space-y-4 text-sm">
      <div className="border-gray-200 font-bold border p-4 text-gray-900 leading-relaxed">
        <p className="mb-4">
          {task1.report}
        </p>
        <p>Summarise the information by selecting and reporting the main features, and make comparisons where relevant.</p>
      </div>
      {task1.image && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <img
            src={task1.image}
            alt="Task 1 chart or diagram"
            className="w-full h-auto object-contain"
          />
        </div>
      )}
    </div>
  );
}
