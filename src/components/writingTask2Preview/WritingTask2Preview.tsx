interface Props {
  task2: string;
}

export default function WritingTask2Preview({ task2 }: Props) {
  return (
    <div className="space-y-4 text-sm ">
      <p className="text-black! dark:text-neutral-200!">Write about the following topic:</p>
      <p className="border-gray-200 dark:border-neutral-800 font-bold border p-4 text-gray-900 dark:text-neutral-100 leading-relaxed">{task2}</p>
      <p className="text-black! dark:text-neutral-200!">
        Give reasons for your answer and include relevant examples from your own
        knowledge or experience.
      </p>
    </div>
  );
}
