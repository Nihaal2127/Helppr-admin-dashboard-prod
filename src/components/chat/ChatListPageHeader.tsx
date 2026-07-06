import React from "react";
import { useNavigate } from "react-router-dom";
import CustomHeader from "../CustomHeader";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { FranchiseHeaderFormValues } from "../../lib/global/hooks/useFranchiseScopedGetCount";

type ChatListPageHeaderProps = {
  title: string;
  backPath: string;
  register: UseFormRegister<FranchiseHeaderFormValues>;
  setValue: UseFormSetValue<FranchiseHeaderFormValues>;
  socketConnected: boolean;
  socketError: string | null;
};

const ChatListPageHeader: React.FC<ChatListPageHeaderProps> = ({
  title,
  backPath,
  register,
  setValue,
  socketConnected,
  socketError,
}) => {
  const navigate = useNavigate();

  return (
    <CustomHeader
      title={title}
      register={register}
      setValue={setValue}
      titlePrefix={
        <button
          type="button"
          className="financial-subpage-back text-danger"
          onClick={() => navigate(backPath)}
          aria-label="Back to ticket management"
        >
          <i className="bi bi-chevron-left" />
        </button>
      }
      rightActions={
        socketConnected ? (
          <span className="badge bg-success-subtle text-success border border-success-subtle">
            Live
          </span>
        ) : (
          <span className="badge bg-warning-subtle text-warning border border-warning-subtle">
            {socketError ? "Offline" : "Connecting…"}
          </span>
        )
      }
    />
  );
};

export default ChatListPageHeader;
