interface Task1 {
  image: string;
  report: string;
}

interface Props {
  task1: Task1;
}

export default function WritingTask1Preview({ task1 }: Props) {
  return (
    <div className="space-y-4">
      <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
        <p className="text-sm font-bold text-gray-900 leading-relaxed">{task1.report}</p>
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
