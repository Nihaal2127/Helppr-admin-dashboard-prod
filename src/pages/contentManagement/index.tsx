import ContentManagement from "./ContentManagement";
import { useForm } from "react-hook-form";

const ContentManagementPage = () => {
  const { register, setValue } = useForm<any>();
  return <ContentManagement register={register} setValue={setValue} />;
};

export default ContentManagementPage;
