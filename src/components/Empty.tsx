

import { EmptyState, VStack } from "@chakra-ui/react"

interface  Props{
  icon:string
  title:string
  description:string
}
const Empty = ({icon,title,description}:Props) => {
  return (
    <EmptyState.Root>
      <EmptyState.Content>
        <EmptyState.Indicator>
          {icon}
        </EmptyState.Indicator>
        <VStack textAlign="center">
          <EmptyState.Title>{title}</EmptyState.Title>
          <EmptyState.Description>
            {description}
          </EmptyState.Description>
        </VStack>
      </EmptyState.Content>
    </EmptyState.Root>
  )
}

export default Empty;

