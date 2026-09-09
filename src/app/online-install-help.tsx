import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function OnlineInstallHelp() {
  return <Accordion type="single" collapsible>
    <AccordionItem value="online-install-help">
      <AccordionTrigger>설치 및 온라인 이용 안내</AccordionTrigger>
      <AccordionContent className="space-y-3">
        <p>학습에는 인터넷 연결이 필요합니다. 진행상황과 설정은 계정에 저장하며, MP3 음성만 이 기기에 임시 보관합니다. 음성을 들을 때마다 20일 보관 기간이 갱신됩니다.</p>
        <p>iPhone에서는 Safari의 공유 메뉴에서 ‘홈 화면에 추가’를 선택하세요. Android와 데스크톱에서는 브라우저 메뉴의 ‘설치’ 또는 ‘홈 화면에 추가’를 이용하세요. 메뉴는 브라우저에 따라 다를 수 있습니다.</p>
      </AccordionContent>
    </AccordionItem>
  </Accordion>;
}
