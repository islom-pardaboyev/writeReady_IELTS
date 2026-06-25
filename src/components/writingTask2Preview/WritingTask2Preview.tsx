interface Props {
  task2: string;
}

export default function WritingTask2Preview({ task2 }: Props) {
  return (
    <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
      <p className="text-sm font-bold text-gray-900 leading-relaxed">{task2}</p>
    </div>
  );
}
