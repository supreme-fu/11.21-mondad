import { useState } from 'react';
import { Eye, EyeOff, LoaderCircle, MessageSquareHeart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';

interface ReflectionShareDialogProps {
  open: boolean;
  completionId: string | null;
  activityTitle: string;
  initialText?: string;
  onCompleteChoice: () => Promise<void> | void;
}

export function ReflectionShareDialog({
  open,
  completionId,
  activityTitle,
  initialText = '',
  onCompleteChoice,
}: ReflectionShareDialogProps) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState<'shared' | 'private' | null>(null);
  const [error, setError] = useState('');

  async function submitChoice(visibility: 'shared' | 'private') {
    const trimmed = text.trim();
    if (visibility === 'shared' && !trimmed) {
      setError('选择分享给同路人时，请先写下一句感受或评论。');
      return;
    }
    if (trimmed.length > 500) {
      setError('感受最多 500 字，请稍微精简。');
      return;
    }
    setSaving(visibility);
    setError('');
    try {
      if (completionId && trimmed) {
        await api.saveReflection(completionId, trimmed, visibility);
      }
      toast.success(
        visibility === 'shared'
          ? '已保存并分享给完成同一约定的同路人。'
          : trimmed
            ? '已私密保存，仅自己可见。'
            : '已完成记录，为你翻开同路人的字条。',
      );
      await onCompleteChoice();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) {
          void onCompleteChoice();
        }
      }}
    >
      <DialogContent className="onchain-confirm-dialog" data-testid="reflection-share-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareHeart size={18} />
            留下一句此刻的感受或评论？
          </DialogTitle>
          <DialogDescription>
            你刚完成了「{activityTitle}」。你可以写下感受并选择是否分享给完成同一约定的人；选择结束后，将为你展开其他同路人留下的分享。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <textarea
            className="lp-review-input"
            rows={4}
            maxLength={500}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder="写下一句此刻的感受或想法（最多 500 字，也可以不写直接跳过）…"
            data-testid="share-dialog-textarea"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>正文仅保存在链下，之后随时可以撤回或删除</span>
            <span>{text.length} / 500</span>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={Boolean(saving)}
            onClick={() => void onCompleteChoice()}
            data-testid="share-dialog-skip-btn"
          >
            暂不填写，看看大家的分享
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(saving)}
            onClick={() => void submitChoice('private')}
            data-testid="share-dialog-private-btn"
          >
            {saving === 'private' ? <LoaderCircle className="animate-spin" size={14} /> : <EyeOff size={14} />}
            不分享（仅自己可见）
          </Button>
          <Button
            type="button"
            disabled={Boolean(saving)}
            onClick={() => void submitChoice('shared')}
            data-testid="share-dialog-public-btn"
          >
            {saving === 'shared' ? <LoaderCircle className="animate-spin" size={14} /> : <Eye size={14} />}
            愿意分享给同路人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
