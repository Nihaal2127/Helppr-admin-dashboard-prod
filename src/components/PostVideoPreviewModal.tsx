import React, { useEffect, useRef } from "react";
import { Modal } from "react-bootstrap";
import HlsImport from "hls.js";
import CustomCloseButton from "./CustomCloseButton";
import { resolvePartnerPostVideoPlaybackUrl } from "../services/partnerManagementService";

type HlsPlayer = {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
};

type HlsStatic = {
  isSupported: () => boolean;
  new (): HlsPlayer;
};

/** CRA may expose hls.js as default or as the module namespace. */
const Hls = (HlsImport as unknown as { default?: HlsStatic }).default ??
  (HlsImport as unknown as HlsStatic);

type PostVideoPreviewModalProps = {
  show: boolean;
  onHide: () => void;
  videoUrl: string;
  title?: string;
};

const PostVideoPreviewModal: React.FC<PostVideoPreviewModalProps> = ({
  show,
  onHide,
  videoUrl,
  title = "Video preview",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsPlayer | null>(null);

  const playbackUrl = resolvePartnerPostVideoPlaybackUrl(videoUrl);
  const isBlobOrData = /^(blob:|data:)/i.test(playbackUrl);

  useEffect(() => {
    if (!show) return;

    const video = videoRef.current;
    if (!video || !playbackUrl) return;

    const isHls = !isBlobOrData && /\.m3u8(\?|$)/i.test(playbackUrl);

    if (isHls && typeof Hls.isSupported === "function" && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      void video.play().catch(() => undefined);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (
      isHls &&
      video.canPlayType("application/vnd.apple.mpegurl") !== ""
    ) {
      video.src = playbackUrl;
      void video.play().catch(() => undefined);
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    video.src = playbackUrl;
    void video.play().catch(() => undefined);
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [show, playbackUrl, isBlobOrData]);

  useEffect(() => {
    if (show) return;
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, [show]);

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      dialogClassName="custom-big-modal"
      enforceFocus={false}
    >
      <Modal.Header className="py-3 px-4 border-bottom-0">
        <Modal.Title as="h5" className="custom-modal-title mb-0">
          {title}
        </Modal.Title>
        <CustomCloseButton onClose={onHide} />
      </Modal.Header>
      <Modal.Body className="px-4 pb-4 pt-0">
        {playbackUrl ? (
          <video
            ref={videoRef}
            controls
            playsInline
            className="d-block w-100 rounded"
            style={{ maxHeight: "70vh", backgroundColor: "#000" }}
          />
        ) : (
          <p className="text-muted mb-0 text-center py-4">
            No video available to preview.
          </p>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default PostVideoPreviewModal;
