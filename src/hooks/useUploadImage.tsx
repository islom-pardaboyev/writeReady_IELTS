import { useState } from "react";
import { IMGBB_API_KEY } from "./useEnv";


const useUpload = () => {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadImage = async (file: File) => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await res.json();
      const imageUrl = data.data.url;

      setUrl(imageUrl);
      return imageUrl;
    } catch (err) {
      setError("Xatolik yuz berdi.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return { uploadImage, url, uploading, error };
};

export default useUpload;