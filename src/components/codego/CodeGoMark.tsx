import codeGoLogo from "@/assets/icons/codego-logo.svg";

type CodeGoMarkProps = {
  className?: string;
  size?: number;
};

export function CodeGoMark({ className, size = 40 }: CodeGoMarkProps) {
  return (
    <img
      src={codeGoLogo}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
