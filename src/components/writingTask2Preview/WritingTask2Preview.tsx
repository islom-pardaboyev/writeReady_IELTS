interface Props {
  task2: string;
}

export default function WritingTask2Preview({ task2 }: Props) {
  return (
    <div className="space-y-4 text-sm">
      <p>Write about the following topic:</p>
      <p className="border-gray-200 font-bold border p-4 text-gray-900 leading-relaxed">{task2}</p>
      <p>
        Give reasons for your answer and include relevant examples from your own
        knowledge or experience.
      </p>
    </div>
  );
}
