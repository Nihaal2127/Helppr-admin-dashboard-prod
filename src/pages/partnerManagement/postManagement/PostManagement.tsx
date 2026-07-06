import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomHeader from "../../../components/CustomHeader";
import CustomSummaryBox from "../../../components/CustomSummaryBox";
import CustomUtilityBox from "../../../components/CustomUtilityBox";
import CustomTable from "../../../components/CustomTable";
import AddEditPostManagementDialog from "./AddEditPostManagementDialog";
import type { PostModel } from "../../../lib/types/partnerManagementTypes";
import {
  fetchPostList,
  fetchPostManagementSummary,
  postStatusDisplayLabel,
  postStatusTextClass,
  USE_MOCK_PARTNER_POSTS_API,
} from "../../../services/partnerManagementService";
import type { PostManagementStats } from "../../../services/partnerManagementService";
import { useFranchiseHeaderForm } from "../../../lib/global/hooks/useFranchiseScopedGetCount";
import { franchiseIdForApiQuery } from "../../../lib/franchise/headerFranchisePreference";

type PostManagementProps = {
  onBack?: () => void;
};

type PostListFilter = "all" | PostModel["status"];

const EMPTY_STATS: PostManagementStats = {
  Total: 0,
  Published: 0,
  Hidden: 0,
  Removed: 0,
};

const PostManagement = ({ onBack }: PostManagementProps) => {
  const { register, setValue, franchiseId: headerFranchiseId } =
    useFranchiseHeaderForm();
  const [selectedStatus, setSelectedStatus] = useState<PostListFilter>("all");
  const [filters, setFilters] = useState<{
    name?: string;
    sort?: string;
  }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [postList, setPostList] = useState<PostModel[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [summaryData, setSummaryData] = useState<PostManagementStats>(EMPTY_STATS);
  const listFetchRef = useRef(false);
  const summaryReqSeqRef = useRef(0);

  const listFilters = useMemo(() => {
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    return {
      status: selectedStatus,
      ...(fid ? { franchiseId: fid } : {}),
      ...filters,
    };
  }, [headerFranchiseId, selectedStatus, filters]);

  const refreshSummary = useCallback(async () => {
    const seq = (summaryReqSeqRef.current += 1);
    const fid = franchiseIdForApiQuery(headerFranchiseId);
    const stats = await fetchPostManagementSummary(fid || undefined);
    if (seq !== summaryReqSeqRef.current) return;
    setSummaryData(stats);
  }, [headerFranchiseId]);

  const fetchList = useCallback(async () => {
    if (listFetchRef.current) return;
    listFetchRef.current = true;
    try {
      const res = await fetchPostList(currentPage, pageSize, listFilters);
      if (res.response) {
        setPostList(res.records);
        setTotalPages(res.totalPages);
      } else {
        setPostList([]);
        setTotalPages(0);
      }
    } finally {
      listFetchRef.current = false;
    }
  }, [currentPage, pageSize, listFilters]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const refreshPosts = useCallback(() => {
    void Promise.all([refreshSummary(), fetchList()]);
  }, [refreshSummary, fetchList]);

  const handleFilterChange = (next: { name?: string; sort?: string }) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, ...next }));
  };

  const handleSummaryClick = (key: string) => {
    const value = key.toLowerCase();
    setCurrentPage(1);

    if (value === "total") {
      setSelectedStatus("all");
      return;
    }

    if (value === "published" || value === "hidden" || value === "removed") {
      setSelectedStatus(value);
      return;
    }

    setSelectedStatus("all");
  };

  const handleView = (post: PostModel): void => {
    AddEditPostManagementDialog.show(false, post, () => {
      refreshPosts();
    });
  };

  const columns = [
    {
      Header: "SR No",
      accessor: "sr_no",
      Cell: ({ row }: { row: any }) => (currentPage - 1) * pageSize + row.index + 1,
    },
    {
      Header: "Partner Name",
      accessor: "partner_name",
    },
    {
      Header: "No of Images",
      accessor: "no_of_images",
      Cell: ({ row }: { row: any }) => {
        const post = row.original as PostModel;
        if (post.no_of_images != null) return <span>{post.no_of_images}</span>;
        return <span>{post.media_type === "image" ? 1 : 0}</span>;
      },
    },
    {
      Header: "No of Videos",
      accessor: "no_of_videos",
      Cell: ({ row }: { row: any }) => {
        const post = row.original as PostModel;
        if (post.no_of_videos != null) return <span>{post.no_of_videos}</span>;
        return <span>{post.media_type === "video" ? 1 : 0}</span>;
      },
    },
    {
      Header: "Uploaded Date",
      accessor: "uploaded_date",
    },
    {
      Header: "Status",
      accessor: "status",
      Cell: ({ row }: { row: any }) => {
        const status = (row.original as PostModel).status;
        return (
          <span className={postStatusTextClass(status)}>
            {postStatusDisplayLabel(status)}
          </span>
        );
      },
    },
    {
      Header: "Action",
      accessor: "action",
      Cell: ({ row }: { row: any }) => {
        const post = row.original as PostModel;
        return (
          <div className="d-flex justify-content-center gap-3">
            <i
              className="bi bi-eye-fill"
              role="button"
              title="View"
              onClick={() => handleView(post)}
              style={{ cursor: "pointer" }}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="main-page-content">
      <CustomHeader
        title="Post Management"
        register={register}
        setValue={setValue}
        titlePrefix={
          <button
            type="button"
            className="financial-subpage-back"
            onClick={() => onBack?.()}
            aria-label="Go to Partner Management"
          >
            <i className="bi bi-chevron-left text-danger"></i>
          </button>
        }
      />

      <CustomSummaryBox
        divId="box-post-management"
        title="Post Management"
        data={summaryData}
        onSelect={() => {
          setCurrentPage(1);
          setSelectedStatus("all");
        }}
        isSelected={true}
        onFilterChange={() => {}}
        onItemClick={handleSummaryClick}
        isAddShow={USE_MOCK_PARTNER_POSTS_API}
        addButtonLable="Add post"
        onAddClick={() =>
          AddEditPostManagementDialog.show(true, null, () => {
            refreshPosts();
          })
        }
      />

      <CustomUtilityBox
        title="Post Management"
        searchHint="Search Partner Name"
        onSearch={(value: string) => {
          handleFilterChange({ name: value });
        }}
        syncKeyword={filters.name ?? ""}
      />

      <CustomTable
        columns={columns}
        data={postList}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page: number) => setCurrentPage(page)}
        onLimitChange={(limit: number) => {
          setCurrentPage(1);
          setPageSize(limit);
        }}
        theadClass="table-light"
      />
    </div>
  );
};

export default PostManagement;
