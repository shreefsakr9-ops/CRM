'use client';

/**
 * آخر حدّ للأخطاء: يلتقط ما يقع داخل التخطيط الجذري نفسه، حيث لا تعمل حدود
 * الأخطاء الأخرى. لذلك يحمل وسمَي html وbody بنفسه، ويبقى بلا اعتماد على أي
 * مكوّن من التطبيق حتى لا يفشل هو أيضًا.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B1A2F',
          color: '#E8EEF7',
          fontFamily: "'Cairo','Segoe UI',Tahoma,Arial,sans-serif",
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
          Blue <span style={{ color: '#3FC8F5' }}>Point</span>
        </p>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 24 }}>تعذّر تحميل النظام</h1>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: '#9CB0C9', maxWidth: 420 }}>
          وقع خطأ غير متوقع أثناء بدء الصفحة. أعد المحاولة، وإن تكرر أبلغ مسؤول النظام بالمعرّف
          أدناه.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 24,
            border: 0,
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: '#2C7BE5',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة
        </button>
        {error.digest && (
          <p style={{ marginTop: 24, fontSize: 11, color: '#5C7189' }} dir="ltr">
            reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
